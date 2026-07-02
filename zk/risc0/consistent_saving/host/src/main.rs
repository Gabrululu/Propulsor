// RISC Zero host — consistent_saving proof generator
//
// Reads split history from Supabase, runs the guest program in the zkVM,
// and produces a receipt. The journal + attester signature are then submitted
// to a Soroban contract (attestation pattern until CAP-0074 is live).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_KEY=... USER_ID=... cargo run
//   Optional: MIN_AMOUNT_USDC=<base units>  THRESHOLD_MONTHS=6

use risc0_zkvm::{default_prover, ExecutorEnv};
use serde::{Deserialize, Serialize};
use std::env;

// Embed the guest ELF at compile time
include!(concat!(env!("OUT_DIR"), "/methods.rs"));

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

fn main() {
    let user_id         = env::var("USER_ID").expect("USER_ID env var required");
    let supabase_url    = env::var("SUPABASE_URL").expect("SUPABASE_URL env var required");
    let supabase_key    = env::var("SUPABASE_KEY").expect("SUPABASE_KEY env var required");
    let min_amount_usdc = env::var("MIN_AMOUNT_USDC")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1_0000000); // default: $1 USDC minimum
    let threshold_months: u32 = env::var("THRESHOLD_MONTHS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(6);

    println!("→ Fetching split history for user {}...", user_id);

    // Fetch last 12 months of splits from Supabase REST API
    let client = reqwest::blocking::Client::new();
    let rows: Vec<SupabaseRow> = client
        .get(format!(
            "{}/rest/v1/agent_activity?user_id=eq.{}&event_type=eq.split_executed&order=created_at.desc&limit=120",
            supabase_url, user_id
        ))
        .header("apikey", &supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .send()
        .expect("Supabase request failed")
        .json()
        .expect("Failed to parse Supabase response");

    println!("  Found {} split records", rows.len());

    // Convert to SplitRecord (parse ISO timestamps → Unix)
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

    // Build executor environment with private inputs
    let env = ExecutorEnv::builder()
        .write(&splits).expect("Failed to write splits")
        .write(&min_amount_usdc).expect("Failed to write min_amount")
        .write(&threshold_months).expect("Failed to write threshold")
        .build()
        .expect("Failed to build executor env");

    // Generate proof
    println!("\n→ Generating ZK proof (this may take a few minutes)...");
    let prover = default_prover();
    let receipt = prover
        .prove(env, CONSISTENT_SAVING_ELF)
        .expect("Proof generation failed");

    // Decode journal
    let journal: Journal = receipt.journal.decode().expect("Failed to decode journal");
    println!("\n✓ Proof generated!");
    println!("  Months with saving: {}/{}", journal.months_with_saving, journal.threshold_months);
    println!("  Passes            : {}", journal.passes);

    // Verify receipt (sanity check)
    receipt.verify(CONSISTENT_SAVING_ID).expect("Receipt verification failed");
    println!("✓ Receipt verified");

    // Serialize receipt to JSON for Soroban submission
    let receipt_json = serde_json::to_string_pretty(&receipt).expect("Serialization failed");
    std::fs::write("receipt.json", receipt_json).expect("Failed to write receipt");
    println!("\n✓ Receipt saved to receipt.json");
    println!("  Submit to Soroban attester via the agent API or verify_onchain.ts");
    println!("  Note: On-chain BN254 verification requires CAP-0074 (Protocol 26)");
    println!("  For now: submit journal + attester signature to the Soroban contract");
}

/// Approximate ISO 8601 → Unix timestamp (handles "2024-01-15T10:30:00Z" format)
fn iso_to_unix(iso: &str) -> Option<u64> {
    // Use a simple parse: take the date part and compute epoch offset
    let parts: Vec<&str> = iso.split('T').collect();
    if parts.len() < 1 { return None; }
    let date_parts: Vec<u32> = parts[0].split('-')
        .filter_map(|p| p.parse().ok())
        .collect();
    if date_parts.len() != 3 { return None; }

    // Rough epoch (ignoring leap years)
    let year = date_parts[0] as u64;
    let month = date_parts[1] as u64;
    let day = date_parts[2] as u64;
    let days = (year - 1970) * 365 + (year - 1969) / 4 + (month - 1) * 30 + day;
    Some(days * 86_400)
}
