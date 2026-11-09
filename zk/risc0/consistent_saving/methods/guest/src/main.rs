// RISC Zero guest program — consistent_saving
//
// Proves that a user completed splits in >= threshold_months distinct calendar
// months out of the 12 before `as_of`, without putting amounts in the output.
//
// Private input: the user's raw split history from SplitProtocol's
// get_split_history, as records of timestamp (8 bytes) || income (16 bytes),
// big-endian.
//
// Public output (journal, big-endian):
//   months_with_saving u32 | threshold_months u32 | min_amount u64 | as_of u64
//   | user_hash [32] | history_hash [32]
//
// ConsistentSavingVerifier (Soroban) checks user_hash and history_hash against
// the chain, so neither the prover nor whoever submits can claim another user
// or invent a history. See ../../SPEC.md.

#![no_main]

use risc0_zkvm::{
    guest::env,
    sha::{Impl, Sha256},
};
use std::collections::HashSet;

risc0_zkvm::guest::entry!(main);

const RECORD_LEN: usize = 24;
const WINDOW_SECS: u64 = 365 * 86_400;

fn main() {
    let user_hash: [u8; 32] = env::read();
    let history: Vec<u8> = env::read();
    let as_of: u64 = env::read();
    let min_amount: u64 = env::read();
    let threshold_months: u32 = env::read();
    assert_eq!(history.len() % RECORD_LEN, 0, "malformed history");

    let mut months = HashSet::new();
    for record in history.chunks_exact(RECORD_LEN) {
        let timestamp = u64::from_be_bytes(record[..8].try_into().unwrap());
        let income = i128::from_be_bytes(record[8..].try_into().unwrap());
        let in_window = timestamp <= as_of && as_of - timestamp < WINDOW_SECS;
        if in_window && income >= min_amount as i128 {
            months.insert(year_month(timestamp));
        }
    }

    let mut journal = Vec::with_capacity(88);
    journal.extend_from_slice(&(months.len() as u32).to_be_bytes());
    journal.extend_from_slice(&threshold_months.to_be_bytes());
    journal.extend_from_slice(&min_amount.to_be_bytes());
    journal.extend_from_slice(&as_of.to_be_bytes());
    journal.extend_from_slice(&user_hash);
    journal.extend_from_slice(Impl::hash_bytes(&history).as_bytes());
    env::commit_slice(&journal);
}

/// Calendar (year, month) in UTC, from days since the Unix epoch
/// (Howard Hinnant's civil_from_days).
fn year_month(timestamp: u64) -> (i64, u32) {
    let z = (timestamp / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month)
}
