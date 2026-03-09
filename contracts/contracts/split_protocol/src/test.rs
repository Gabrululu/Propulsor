#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, Env};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn make_env() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let user = Address::generate(&env);
    (env, user)
}

fn register(env: &Env) -> SplitProtocolClient<'_> {
    let id = env.register(SplitProtocol, ());
    SplitProtocolClient::new(env, &id)
}

fn default_rules(env: &Env) -> soroban_sdk::Vec<SplitRule> {
    vec![
        env,
        SplitRule { vault_id: 0, percentage: 60 },
        SplitRule { vault_id: 1, percentage: 30 },
        SplitRule { vault_id: 2, percentage: 10 },
    ]
}

fn find_balance(bals: &soroban_sdk::Vec<VaultBalance>, vault_id: u32) -> i128 {
    for i in 0..bals.len() {
        let b = bals.get(i).unwrap();
        if b.vault_id == vault_id {
            return b.balance;
        }
    }
    panic!("vault {} not found", vault_id);
}

// ---------------------------------------------------------------------------
// 1. set_rules / get_rules round-trip
// ---------------------------------------------------------------------------

#[test]
fn test_set_and_get_rules() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(&user, &default_rules(&env));
    let stored = client.get_rules(&user);

    assert_eq!(stored.len(), 3);
    assert_eq!(stored.get(0).unwrap().vault_id, 0);
    assert_eq!(stored.get(0).unwrap().percentage, 60);
    assert_eq!(stored.get(1).unwrap().vault_id, 1);
    assert_eq!(stored.get(1).unwrap().percentage, 30);
    assert_eq!(stored.get(2).unwrap().vault_id, 2);
    assert_eq!(stored.get(2).unwrap().percentage, 10);
}

// ---------------------------------------------------------------------------
// 2. Basic split: 100 USDC → 60 / 30 / 10
// ---------------------------------------------------------------------------

#[test]
fn test_execute_split_basic() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(&user, &default_rules(&env));
    let bals = client.execute_split(&user, &1_000_000_000_i128);

    assert_eq!(bals.len(), 3);
    assert_eq!(find_balance(&bals, 0), 600_000_000);
    assert_eq!(find_balance(&bals, 1), 300_000_000);
    assert_eq!(find_balance(&bals, 2), 100_000_000);
}

// ---------------------------------------------------------------------------
// 3. Balances accumulate across multiple splits
// ---------------------------------------------------------------------------

#[test]
fn test_split_accumulates() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(&user, &default_rules(&env));
    client.execute_split(&user, &1_000_000_000_i128);
    let bals = client.execute_split(&user, &1_000_000_000_i128);

    assert_eq!(find_balance(&bals, 0), 1_200_000_000);
    assert_eq!(find_balance(&bals, 1), 600_000_000);
    assert_eq!(find_balance(&bals, 2), 200_000_000);
}

// ---------------------------------------------------------------------------
// 4-a. Percentage out of range per rule → InvalidPercentage
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_zero_percentage_rule() {
    let (env, user) = make_env();
    let client = register(&env);

    // A 0% rule is rejected before the sum check.
    client.set_rules(
        &user,
        &vec![
            &env,
            SplitRule { vault_id: 0, percentage: 100 },
            SplitRule { vault_id: 1, percentage: 0 }, // invalid
        ],
    );
}

#[test]
#[should_panic]
fn test_oversized_percentage_rule() {
    let (env, user) = make_env();
    let client = register(&env);

    // A 200% rule must be rejected individually (prevents u32 overflow in sum).
    client.set_rules(
        &user,
        &vec![
            &env,
            SplitRule { vault_id: 0, percentage: 200 }, // invalid
        ],
    );
}

// ---------------------------------------------------------------------------
// 4-b. No stroop lost — dust goes to vault 0 (anchor vault)
// ---------------------------------------------------------------------------

#[test]
fn test_split_no_dust() {
    let (env, user) = make_env();
    let client = register(&env);

    // income = 3 stroops with 60/30/10:
    //   vault0 = 3*60/100 = 1 (floor)
    //   vault1 = 3*30/100 = 0 (floor)
    //   vault2 = 3*10/100 = 0 (floor)
    //   total_distributed = 1, remainder = 2 → added to vault0
    //   expected: vault0 = 3, vault1 = 0, vault2 = 0
    client.set_rules(&user, &default_rules(&env));
    let bals = client.execute_split(&user, &3_i128);

    let total: i128 = (0..bals.len()).map(|i| bals.get(i).unwrap().balance).sum();
    assert_eq!(total, 3, "every stroop must be accounted for");
    assert_eq!(find_balance(&bals, 0), 3);
}

// ---------------------------------------------------------------------------
// 5. Percentages summing to 99 → InvalidSum
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_invalid_sum_99() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(
        &user,
        &vec![
            &env,
            SplitRule { vault_id: 0, percentage: 60 },
            SplitRule { vault_id: 1, percentage: 30 },
            SplitRule { vault_id: 2, percentage: 9 },
        ],
    );
}

// ---------------------------------------------------------------------------
// 5. Percentages summing to 101 → InvalidSum
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_invalid_sum_101() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(
        &user,
        &vec![
            &env,
            SplitRule { vault_id: 0, percentage: 60 },
            SplitRule { vault_id: 1, percentage: 30 },
            SplitRule { vault_id: 2, percentage: 11 },
        ],
    );
}

// ---------------------------------------------------------------------------
// 6. Empty rules vec → EmptyRules
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_empty_rules() {
    let (env, user) = make_env();
    let client = register(&env);

    let rules: soroban_sdk::Vec<SplitRule> = soroban_sdk::Vec::new(&env);
    client.set_rules(&user, &rules);
}

// ---------------------------------------------------------------------------
// 7. execute_split with no rules set → NoRulesSet
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_no_rules_before_split() {
    let (env, user) = make_env();
    let client = register(&env);

    client.execute_split(&user, &1_000_000_000_i128);
}

// ---------------------------------------------------------------------------
// 8. Zero income → InvalidIncome
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_zero_income() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(&user, &default_rules(&env));
    client.execute_split(&user, &0_i128);
}

// ---------------------------------------------------------------------------
// 9. reset_balances clears all balances
// ---------------------------------------------------------------------------

#[test]
fn test_reset_balances() {
    let (env, user) = make_env();
    let client = register(&env);

    client.set_rules(&user, &default_rules(&env));
    client.execute_split(&user, &1_000_000_000_i128);

    assert!(!client.get_balances(&user).is_empty());

    client.reset_balances(&user);
    assert!(client.get_balances(&user).is_empty());
}
