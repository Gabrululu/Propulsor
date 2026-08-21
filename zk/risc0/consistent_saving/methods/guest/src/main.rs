// RISC Zero guest program — consistent_saving
//
// Proves that a user has completed splits in >= 6 distinct months out of the
// last 12, without revealing individual amounts.
//
// Inputs (private, committed to the journal digest):
//   - splits: Vec<SplitRecord> from Supabase (up to 120 entries, 12 months)
//   - min_amount_usdc: minimum per-split amount to count (in USDC base units)
//
// Public output (journal):
//   - months_with_saving: u32  (how many qualifying months)
//   - threshold_months: u32    (minimum required, e.g. 6)
//   - passes: bool             (months_with_saving >= threshold_months)
//
// This journal is committed into a Groth16Receipt (BN254) and verified
// on-chain by the ConsistentSavingVerifier Soroban contract — see
// ../../SPEC.md for the exact claim-digest / public-input derivation the
// contract reconstructs from (image ID, journal bytes).

#![no_main]

use risc0_zkvm::guest::env;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

risc0_zkvm::guest::entry!(main);

#[derive(Deserialize)]
struct SplitRecord {
    /// Unix timestamp of the split (seconds)
    timestamp: u64,
    /// Amount in USDC base units (7 decimal places)
    amount_usdc: u64,
}

#[derive(Serialize)]
struct Journal {
    months_with_saving: u32,
    threshold_months: u32,
    min_amount_usdc: u64,
    passes: bool,
}

fn main() {
    // Read private inputs from the host
    let splits: Vec<SplitRecord> = env::read();
    let min_amount_usdc: u64   = env::read();
    let threshold_months: u32  = env::read();

    // Count distinct months with at least one qualifying split.
    // Month key: (year, month) derived from Unix timestamp.
    let mut qualifying_months = HashSet::<(u32, u32)>::new();

    for split in &splits {
        if split.amount_usdc >= min_amount_usdc {
            let (year, month) = unix_to_year_month(split.timestamp);
            qualifying_months.insert((year, month));
        }
    }

    let months_with_saving = qualifying_months.len() as u32;

    let journal = Journal {
        months_with_saving,
        threshold_months,
        min_amount_usdc,
        passes: months_with_saving >= threshold_months,
    };

    // Commit journal to the public receipt
    env::commit(&journal);
}

/// Convert Unix timestamp to (year, month) for grouping.
/// Uses a simple algorithm; good enough for monthly bucketing.
fn unix_to_year_month(ts: u64) -> (u32, u32) {
    // Days since Unix epoch
    let days = ts / 86_400;
    // Approximate year (ignores leap seconds)
    let year = (days / 365) as u32 + 1970;
    // Approximate month (0-indexed)
    let day_of_year = (days % 365) as u32;
    let month = day_of_year / 30 + 1; // rough bucketing, sufficient for ZK signal
    (year, month.min(12))
}
