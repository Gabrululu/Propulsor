#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env};

const BASE_TS: u64 = 1_000_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn make_env() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = BASE_TS);
    let user = Address::generate(&env);
    (env, user)
}

fn register(env: &Env) -> TimeVaultClient<'_> {
    let id = env.register(TimeVault, ());
    TimeVaultClient::new(env, &id)
}

// ---------------------------------------------------------------------------
// 1. Time-locked vault: condition NOT yet met
// ---------------------------------------------------------------------------

#[test]
fn test_lock_by_time_not_yet() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &1u32, &500_000_000_i128, &Some(BASE_TS + 3600), &None);

    assert!(!client.check_release(&user, &1u32));

    let remaining = client.get_time_remaining(&user, &1u32);
    assert!(remaining > 0 && remaining <= 3600);
}

// ---------------------------------------------------------------------------
// 2. Time-locked vault: released after time advances
// ---------------------------------------------------------------------------

#[test]
fn test_lock_by_time_released() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &1u32, &500_000_000_i128, &Some(BASE_TS + 3600), &None);

    env.ledger().with_mut(|li| li.timestamp = BASE_TS + 4000);

    assert!(client.check_release(&user, &1u32));

    let released = client.release_vault(&user, &1u32);
    assert_eq!(released, 500_000_000);
    assert!(client.get_lock(&user, &1u32).is_none());
}

// ---------------------------------------------------------------------------
// 3. Goal-locked vault: condition NOT yet met
// ---------------------------------------------------------------------------

#[test]
fn test_lock_by_goal_not_met() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &2u32, &100_000_i128, &None, &Some(1_000_000_000_i128));

    assert!(!client.check_release(&user, &2u32));
}

// ---------------------------------------------------------------------------
// 4. Goal met via add_to_lock → release succeeds
// ---------------------------------------------------------------------------

#[test]
fn test_lock_by_goal_met_via_add() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &2u32, &300_000_000_i128, &None, &Some(500_000_000_i128));

    assert!(!client.check_release(&user, &2u32));

    client.add_to_lock(&user, &2u32, &200_000_000_i128);

    assert!(client.check_release(&user, &2u32));

    let released = client.release_vault(&user, &2u32);
    assert_eq!(released, 500_000_000);
}

// ---------------------------------------------------------------------------
// 5. release_vault before conditions met → LockNotMet
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_release_before_conditions() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &1u32, &500_000_000_i128, &Some(BASE_TS + 3600), &None);

    // Time has NOT advanced — should panic
    client.release_vault(&user, &1u32);
}

// ---------------------------------------------------------------------------
// 6. No lock on vault → check_release returns true
// ---------------------------------------------------------------------------

#[test]
fn test_no_lock_is_free() {
    let (env, user) = make_env();
    let client = register(&env);
    assert!(client.check_release(&user, &0u32));
}

// ---------------------------------------------------------------------------
// 7. Locking an already-locked vault → AlreadyLocked
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_already_locked() {
    let (env, user) = make_env();
    let client = register(&env);

    client.lock_vault(&user, &1u32, &100_000_i128, &Some(BASE_TS + 100), &None);
    // Second lock on same (user, vault_id) → should panic
    client.lock_vault(&user, &1u32, &100_000_i128, &Some(BASE_TS + 200), &None);
}

// ---------------------------------------------------------------------------
// 8. No condition provided → InvalidParams
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_invalid_params_no_condition() {
    let (env, user) = make_env();
    let client = register(&env);
    client.lock_vault(&user, &0u32, &100_000_i128, &None, &None);
}

// ---------------------------------------------------------------------------
// 9. unlock_timestamp in the past → TimestampPast
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_timestamp_in_past() {
    let (env, user) = make_env();
    let client = register(&env);
    client.lock_vault(&user, &0u32, &100_000_i128, &Some(BASE_TS - 1), &None);
}

// ---------------------------------------------------------------------------
// 10. goal_amount = 0 → InvalidParams (FIX #2)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_goal_amount_zero_rejected() {
    let (env, user) = make_env();
    let client = register(&env);
    // goal = 0 would make the lock immediately releasable — must be rejected.
    client.lock_vault(&user, &2u32, &100_000_i128, &None, &Some(0_i128));
}

// ---------------------------------------------------------------------------
// 11. goal_amount negative → InvalidParams (FIX #2)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_goal_amount_negative_rejected() {
    let (env, user) = make_env();
    let client = register(&env);
    client.lock_vault(&user, &2u32, &100_000_i128, &None, &Some(-1_i128));
}

// ---------------------------------------------------------------------------
// 12. vault_id > 2 → InvalidParams (FIX #5)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_invalid_vault_id_rejected() {
    let (env, user) = make_env();
    let client = register(&env);
    client.lock_vault(&user, &99u32, &100_000_i128, &Some(BASE_TS + 100), &None);
}

// ---------------------------------------------------------------------------
// 13. Dual condition: time unlocks before goal is reached
// ---------------------------------------------------------------------------

#[test]
fn test_dual_condition_time_unlocks_first() {  // was test 10, now test 13
    let (env, user) = make_env();
    let client = register(&env);

    // Goal is enormous; will only be released by time
    client.lock_vault(
        &user,
        &1u32,
        &1_000_i128,
        &Some(BASE_TS + 100),
        &Some(999_999_999_999_i128),
    );

    assert!(!client.check_release(&user, &1u32));

    env.ledger().with_mut(|li| li.timestamp = BASE_TS + 200);

    assert!(client.check_release(&user, &1u32));
    let released = client.release_vault(&user, &1u32);
    assert_eq!(released, 1_000);
}
