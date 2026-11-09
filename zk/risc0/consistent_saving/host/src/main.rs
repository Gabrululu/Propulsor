// RISC Zero host — consistent_saving proof generator
//
// Fetches on-chain split history, runs the guest program in the zkVM,
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
use risc0_zkvm::{default_executor, default_prover, ExecutorEnv, ProverOpts};
use serde::{Deserialize, Serialize};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

/// zk-fetch-user-data's response. `history` is the raw bytes the guest hashes,
/// so anything altered here fails the on-chain check, not just the display.
#[derive(Deserialize)]
struct UserData {
    public_key: String,
    user_hash: String,
    history: String,
}

/// Written for zk/scripts/verify_onchain_consistent_saving.ts and the workflow.
/// `seal` is the raw 256-byte Groth16 proof (a[64] || b[128] || c[64],
/// big-endian) — see SPEC.md: this layout matches CAP-0074's BN254 G1/G2
/// encoding byte-for-byte. It is empty when the user doesn't qualify, since no
/// proof is published then.
#[derive(Serialize)]
struct Fixture {
    user: String,
    seal_hex: String,
    journal_hex: String,
    history_hex: String,
    as_of: u64,
    journal: JournalOut,
    image_id_hex: String,
}

#[derive(Serialize)]
struct JournalOut {
    months_with_saving: u32,
    threshold_months: u32,
    passes: bool,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    let user_id = env::var("USER_ID").expect("USER_ID env var required");
    let supabase_url = env::var("SUPABASE_URL").expect("SUPABASE_URL env var required");
    let zk_webhook_secret = env::var("ZK_WEBHOOK_SECRET").expect("ZK_WEBHOOK_SECRET env var required");
    let min_amount: u64 = env::var("MIN_AMOUNT_USDC")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1_0000000); // default: $1 USDC minimum
    let threshold_months: u32 = env::var("THRESHOLD_MONTHS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(6);

    println!("→ Fetching split history for user {}...", user_id);

    // Lovable Cloud only injects its service role key inside Edge Functions, so
    // this runner reads through zk-fetch-user-data with a shared secret. The
    // function can't lie to us usefully: the verifier contract compares what the
    // proof commits to with the user's history on-chain.
    let data: UserData = reqwest::blocking::Client::new()
        .get(format!("{}/functions/v1/zk-fetch-user-data?user_id={}", supabase_url, user_id))
        .header("Authorization", format!("Bearer {}", zk_webhook_secret))
        .send()
        .expect("zk-fetch-user-data request failed")
        .error_for_status()
        .expect("zk-fetch-user-data returned an error")
        .json()
        .expect("Failed to parse zk-fetch-user-data response");

    let user_hash: [u8; 32] = hex::decode(&data.user_hash)
        .expect("user_hash is not hex")
        .try_into()
        .expect("user_hash is not 32 bytes");
    let history = hex::decode(&data.history).expect("history is not hex");
    let as_of = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before epoch")
        .as_secs();

    let executor_env = || {
        ExecutorEnv::builder()
            .write(&user_hash).expect("Failed to write user_hash")
            .write(&history).expect("Failed to write history")
            .write(&as_of).expect("Failed to write as_of")
            .write(&min_amount).expect("Failed to write min_amount")
            .write(&threshold_months).expect("Failed to write threshold")
            .build()
            .expect("Failed to build executor env")
    };

    // Run the guest without proving first: it takes seconds, and a user who
    // doesn't qualify gets no proof anyway.
    let session = default_executor()
        .execute(executor_env(), CONSISTENT_SAVING_ELF)
        .expect("Guest execution failed");
    let months_with_saving =
        u32::from_be_bytes(session.journal.bytes[0..4].try_into().unwrap());
    let passes = months_with_saving >= threshold_months;
    println!("  Months with saving: {}/{}", months_with_saving, threshold_months);

    let mut seal_hex = String::new();
    let mut journal_bytes = session.journal.bytes.clone();
    if passes {
        // Groth16Receipt (BN254) — constant-size, on-chain-verifiable. Needs
        // Docker (RISC Zero's STARK-to-SNARK wrapper) and takes several minutes.
        println!("\n→ Generating Groth16 proof...");
        let receipt = default_prover()
            .prove_with_opts(executor_env(), CONSISTENT_SAVING_ELF, &ProverOpts::groth16())
            .expect("Proof generation failed")
            .receipt;
        receipt.verify(CONSISTENT_SAVING_ID).expect("Receipt verification failed");
        println!("✓ Receipt verified (off-chain, via risc0-groth16)");
        let groth16 = receipt
            .inner
            .groth16()
            .expect("Receipt is not a Groth16Receipt — did ProverOpts::groth16() run?");
        seal_hex = hex::encode(&groth16.seal);
        journal_bytes = receipt.journal.bytes.clone();
    }

    let fixture = Fixture {
        user: data.public_key,
        seal_hex,
        journal_hex: hex::encode(&journal_bytes),
        history_hex: data.history,
        as_of,
        journal: JournalOut { months_with_saving, threshold_months, passes },
        image_id_hex: hex::encode(CONSISTENT_SAVING_ID.map(|w| w.to_le_bytes()).concat()),
    };
    std::fs::write("fixture.json", serde_json::to_string_pretty(&fixture).expect("Serialization failed"))
        .expect("Failed to write fixture.json");
    println!("\n✓ Fixture saved to fixture.json");
}
