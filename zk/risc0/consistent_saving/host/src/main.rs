// RISC Zero host — consistent_saving proof generator
//
// Reads split history from Supabase, runs the guest program in the zkVM,
// and produces a Groth16Receipt (BN254) suitable for on-chain verification —
// see ../../SPEC.md for exactly how ConsistentSavingVerifier (Soroban)
// reconstructs the public inputs from (image ID, journal bytes).
//
// Requires Docker (the Groth16 STARK-to-SNARK wrapper runs in a container).
//
// Reads split history via the zk-fetch-user-data Edge Function rather than
// Supabase's REST API directly — Lovable Cloud never exposes
// SUPABASE_SERVICE_ROLE_KEY outside its own Edge Functions, so this
// authenticates with the same shared secret zk-proof-webhook uses.
//
// Usage:
//   SUPABASE_URL=... ZK_WEBHOOK_SECRET=... USER_ID=... cargo run
//   Optional: MIN_AMOUNT_USDC=<base units>  THRESHOLD_MONTHS=6

use methods::{CONSISTENT_SAVING_ELF, CONSISTENT_SAVING_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Serialize, Deserialize, Debug)]
struct SplitRecord {
    timestamp: u64,
    amount_usdc: u64,
}

#[derive(Deserialize, Debug)]
struct SupabaseRow {
    created_at: String,
    amount_usdc: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct Journal {
    months_with_saving: u32,
    threshold_months: u32,
    min_amount_usdc: u64,
    passes: bool,
}

/// Fixture written for the ConsistentSavingVerifier contract's #[cfg(test)]
/// suite and for the Phase 4 verify_onchain_consistent_saving.ts script.
/// `seal` is the raw 256-byte Groth16 proof (a[64] || b[128] || c[64],
/// big-endian) — see SPEC.md: this layout matches CAP-0074's BN254 G1/G2
/// encoding byte-for-byte, no reordering needed (unlike the BLS12-381
/// proof_of_vault_verifier's b-point c1/c0 swap).
#[derive(Serialize)]
struct Fixture {
    seal_hex: String,
    journal_hex: String,
    journal: JournalOut,
    image_id_hex: String,
}

#[derive(Serialize)]
struct JournalOut {
    months_with_saving: u32,
    threshold_months: u32,
    min_amount_usdc: u64,
    passes: bool,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    let user_id          = env::var("USER_ID").expect("USER_ID env var required");
    let supabase_url     = env::var("SUPABASE_URL").expect("SUPABASE_URL env var required");
    let zk_webhook_secret = env::var("ZK_WEBHOOK_SECRET").expect("ZK_WEBHOOK_SECRET env var required");
    let min_amount_usdc = env::var("MIN_AMOUNT_USDC")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1_0000000); // default: $1 USDC minimum
    let threshold_months: u32 = env::var("THRESHOLD_MONTHS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(6);

    println!("→ Fetching split history for user {}...", user_id);

    // Fetch last 12 months of splits via the zk-fetch-user-data Edge Function.
    // Lovable Cloud only injects SUPABASE_SERVICE_ROLE_KEY inside Edge
    // Functions — it can't be extracted into a GitHub Actions secret — so
    // this runner authenticates with ZK_WEBHOOK_SECRET instead, and the
    // function does the actual service_role-authenticated read of
    // agent_activity (populated by supabase/functions/agent-webhook on every
    // split_executed event — see ARCHITECTURE.md → Database Schema).
    let client = reqwest::blocking::Client::new();
    let rows: Vec<SupabaseRow> = client
        .get(format!(
            "{}/functions/v1/zk-fetch-user-data?user_id={}",
            supabase_url, user_id
        ))
        .header("Authorization", format!("Bearer {}", zk_webhook_secret))
        .send()
        .expect("zk-fetch-user-data request failed")
        .json()
        .expect("Failed to parse zk-fetch-user-data response");

    println!("  Found {} split records", rows.len());

    let splits: Vec<SplitRecord> = rows
        .iter()
        .filter_map(|row| {
            let ts = iso_to_unix(&row.created_at)?;
            let amount = (row.amount_usdc.unwrap_or(0.0) * 1e7).round() as u64;
            Some(SplitRecord { timestamp: ts, amount_usdc: amount })
        })
        .collect();

    println!("  Converted {} records", splits.len());
    println!("  Min amount: {} (${})", min_amount_usdc, min_amount_usdc as f64 / 1e7);
    println!("  Threshold: {} months", threshold_months);

    let env = ExecutorEnv::builder()
        .write(&splits).expect("Failed to write splits")
        .write(&min_amount_usdc).expect("Failed to write min_amount")
        .write(&threshold_months).expect("Failed to write threshold")
        .build()
        .expect("Failed to build executor env");

    // Groth16Receipt (BN254) — constant-size, on-chain-verifiable.
    // Only supported with Docker installed (RISC Zero runs the STARK-to-SNARK
    // wrapper circuit in a container); this step takes several minutes.
    println!("\n→ Generating Groth16 proof (Docker required, this may take a few minutes)...");
    let prover = default_prover();
    let prove_info = prover
        .prove_with_opts(env, CONSISTENT_SAVING_ELF, &ProverOpts::groth16())
        .expect("Proof generation failed");
    let receipt = prove_info.receipt;

    let journal: Journal = receipt.journal.decode().expect("Failed to decode journal");
    println!("\n✓ Proof generated!");
    println!("  Months with saving: {}/{}", journal.months_with_saving, journal.threshold_months);
    println!("  Passes            : {}", journal.passes);

    // Sanity check: verify the receipt the same way any verifier would,
    // using RISC Zero's own Rust verifier (risc0-groth16, called internally
    // by receipt.verify()) — the ground truth ConsistentSavingVerifier's
    // Soroban logic must reproduce exactly. See SPEC.md.
    receipt.verify(CONSISTENT_SAVING_ID).expect("Receipt verification failed");
    println!("✓ Receipt verified (off-chain, via risc0-groth16)");

    let groth16 = receipt
        .inner
        .groth16()
        .expect("Receipt is not a Groth16Receipt — did ProverOpts::groth16() run?");

    let fixture = Fixture {
        seal_hex: hex::encode(&groth16.seal),
        journal_hex: hex::encode(&receipt.journal.bytes),
        journal: JournalOut {
            months_with_saving: journal.months_with_saving,
            threshold_months: journal.threshold_months,
            min_amount_usdc: journal.min_amount_usdc,
            passes: journal.passes,
        },
        image_id_hex: hex::encode(CONSISTENT_SAVING_ID.map(|w| w.to_le_bytes()).concat()),
    };

    std::fs::write(
        "fixture.json",
        serde_json::to_string_pretty(&fixture).expect("Serialization failed"),
    )
    .expect("Failed to write fixture.json");

    println!("\n✓ Fixture saved to fixture.json");
    println!("  seal: {} bytes (expect 256 — a[64] || b[128] || c[64], big-endian)", groth16.seal.len());
    println!("  Use this fixture for ConsistentSavingVerifier's #[cfg(test)] suite (Phase 3)");
    println!("  and for zk/scripts/verify_onchain_consistent_saving.ts (Phase 4).");
}

/// Approximate ISO 8601 → Unix timestamp (handles "2024-01-15T10:30:00Z" format)
fn iso_to_unix(iso: &str) -> Option<u64> {
    let parts: Vec<&str> = iso.split('T').collect();
    if parts.is_empty() { return None; }
    let date_parts: Vec<u32> = parts[0].split('-')
        .filter_map(|p| p.parse().ok())
        .collect();
    if date_parts.len() != 3 { return None; }

    let year = date_parts[0] as u64;
    let month = date_parts[1] as u64;
    let day = date_parts[2] as u64;
    let days = (year - 1970) * 365 + (year - 1969) / 4 + (month - 1) * 30 + day;
    Some(days * 86_400)
}
