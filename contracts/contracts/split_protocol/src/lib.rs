#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error,
    Address, Env, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// TTL constants — persistent storage for a savings app can sit idle for months.
// Extend TTL on every write so entries survive the ~120-day default window.
//
// 1 ledger ≈ 5 s  →  17 280 ledgers/day
//   THRESHOLD = 30 days  (extension fires before expiry)
//   EXTEND_TO = 180 days (network max on testnet/mainnet ≈ 3 110 400)
// ---------------------------------------------------------------------------
const LEDGER_THRESHOLD: u32 = 518_400;   // 30 days
const LEDGER_EXTEND_TO: u32 = 3_110_400; // 180 days

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct SplitRule {
    pub vault_id: u32,    // 0, 1, or 2
    pub percentage: u32,  // 1–100; all rules must sum to exactly 100
}

#[contracttype]
#[derive(Clone)]
pub struct VaultBalance {
    pub vault_id: u32,
    pub balance: i128,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq)]
pub enum SplitError {
    NoRulesSet         = 1,
    InvalidSum         = 2,
    EmptyRules         = 3,
    InvalidIncome      = 4,
    TooManyRules       = 5,
    InvalidPercentage  = 6, // a single rule's percentage is 0 or > 100
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SplitProtocol;

#[contractimpl]
impl SplitProtocol {
    /// Configure split percentages for a user.
    /// Rules vec must have 1–3 entries; each percentage must be in [1, 100];
    /// all percentages must sum to exactly 100.
    pub fn set_rules(env: Env, user: Address, rules: Vec<SplitRule>) {
        user.require_auth();

        if rules.is_empty() {
            panic_with_error!(&env, SplitError::EmptyRules);
        }
        if rules.len() > 3 {
            panic_with_error!(&env, SplitError::TooManyRules);
        }

        // FIX #3 — validate each rule individually before summing,
        // preventing u32 overflow in the accumulator with adversarial input.
        let mut sum: u32 = 0;
        for i in 0..rules.len() {
            let pct = rules.get(i).unwrap().percentage;
            if pct == 0 || pct > 100 {
                panic_with_error!(&env, SplitError::InvalidPercentage);
            }
            sum += pct;
        }
        if sum != 100 {
            panic_with_error!(&env, SplitError::InvalidSum);
        }

        let sym_rules = Symbol::new(&env, "rules");
        let key = (sym_rules, user.clone());
        env.storage().persistent().set(&key, &rules);
        // FIX #1 — extend TTL so rules survive extended idle periods.
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "rules_set"), user),
            rules.len(),
        );
    }

    /// Split income across vaults according to stored rules.
    /// Accumulates on top of existing balances.
    /// Remainder from integer division is credited to the first vault
    /// so that every stroop of income is always fully distributed.
    pub fn execute_split(env: Env, user: Address, income: i128) -> Vec<VaultBalance> {
        user.require_auth();

        if income <= 0 {
            panic_with_error!(&env, SplitError::InvalidIncome);
        }

        let sym_rules = Symbol::new(&env, "rules");
        let sym_bals = Symbol::new(&env, "bals");

        let rules_key = (sym_rules, user.clone());
        let rules: Vec<SplitRule> = match env
            .storage()
            .persistent()
            .get(&rules_key)
        {
            Some(r) => r,
            None => panic_with_error!(&env, SplitError::NoRulesSet),
        };

        let bals_key = (sym_bals, user.clone());
        let mut balances: Vec<VaultBalance> = env
            .storage()
            .persistent()
            .get(&bals_key)
            .unwrap_or_else(|| Vec::new(&env));

        // FIX #4 — track every stroop distributed to compute remainder.
        let mut total_distributed: i128 = 0;

        for i in 0..rules.len() {
            let rule = rules.get(i).unwrap();
            let amount = income * rule.percentage as i128 / 100;
            total_distributed += amount;

            let mut found_idx: Option<u32> = None;
            let mut found_bal: Option<VaultBalance> = None;

            for j in 0..balances.len() {
                let bal = balances.get(j).unwrap();
                if bal.vault_id == rule.vault_id {
                    found_idx = Some(j);
                    found_bal = Some(bal);
                    break;
                }
            }

            match (found_idx, found_bal) {
                (Some(j), Some(bal)) => {
                    balances.set(
                        j,
                        VaultBalance {
                            vault_id: bal.vault_id,
                            balance: bal.balance + amount,
                        },
                    );
                }
                _ => {
                    balances.push_back(VaultBalance {
                        vault_id: rule.vault_id,
                        balance: amount,
                    });
                }
            }
        }

        // FIX #4 — credit any truncation remainder to the anchor vault
        // (rules[0] = vault 0, "Hogar y gastos").  Max remainder ≤ 2 stroops
        // for 3 rules, but over thousands of splits this matters.
        let remainder = income - total_distributed;
        if remainder > 0 {
            let anchor_vault_id = rules.get(0).unwrap().vault_id;
            let mut found = false;
            for j in 0..balances.len() {
                let bal = balances.get(j).unwrap();
                if bal.vault_id == anchor_vault_id {
                    balances.set(
                        j,
                        VaultBalance {
                            vault_id: bal.vault_id,
                            balance: bal.balance + remainder,
                        },
                    );
                    found = true;
                    break;
                }
            }
            if !found {
                balances.push_back(VaultBalance {
                    vault_id: anchor_vault_id,
                    balance: remainder,
                });
            }
        }

        env.storage().persistent().set(&bals_key, &balances);
        // FIX #1 — extend TTL after every balance update.
        env.storage()
            .persistent()
            .extend_ttl(&bals_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "split_done"), user),
            income,
        );

        balances
    }

    /// Return current vault balances for a user (no auth required).
    pub fn get_balances(env: Env, user: Address) -> Vec<VaultBalance> {
        let sym_bals = Symbol::new(&env, "bals");
        let key = (sym_bals, user);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return stored split rules for a user (no auth required).
    pub fn get_rules(env: Env, user: Address) -> Vec<SplitRule> {
        let sym_rules = Symbol::new(&env, "rules");
        let key = (sym_rules, user);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Wipe all vault balances for a user (keeps rules intact).
    pub fn reset_balances(env: Env, user: Address) {
        user.require_auth();

        let sym_bals = Symbol::new(&env, "bals");
        env.storage()
            .persistent()
            .remove(&(sym_bals, user.clone()));

        env.events()
            .publish((Symbol::new(&env, "reset"), user), 0_u32);
    }
}

#[cfg(test)]
mod test;
