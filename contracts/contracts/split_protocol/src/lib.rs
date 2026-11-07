#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error,
    Address, BytesN, Env, Symbol, Vec,
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

// Split history keeps one record per 10-day window for a bit over a year, so
// its size stays bounded no matter how often a user splits.
const HISTORY_WINDOW_SECS: u64 = 864_000;
const HISTORY_MAX_RECORDS: u32 = 37;

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

/// The largest split a user made in one history window.
#[contracttype]
#[derive(Clone)]
pub struct SplitRecord {
    pub timestamp: u64,
    pub income: i128,
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
    AgentNotAuthorized = 7, // caller is not the agent this user authorized
    PaymentAlreadySplit = 8, // this payment_ref was already split for this user
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

        Self::extend_instance(&env);
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
        Self::apply_split(&env, &user, income)
    }

    /// Let `agent` run splits for `user` until revoked. An agent can only add to
    /// the user's vault accounting: it cannot change rules, reset or withdraw.
    pub fn authorize_agent(env: Env, user: Address, agent: Address) {
        user.require_auth();
        let key = (Symbol::new(&env, "agent"), user.clone());
        env.storage().persistent().set(&key, &agent);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
        Self::extend_instance(&env);
        env.events()
            .publish((Symbol::new(&env, "agent_set"), user), agent);
    }

    /// Remove the user's agent authorization.
    pub fn revoke_agent(env: Env, user: Address) {
        user.require_auth();
        env.storage()
            .persistent()
            .remove(&(Symbol::new(&env, "agent"), user.clone()));
        env.events()
            .publish((Symbol::new(&env, "agent_off"), user), 0_u32);
    }

    /// The agent this user authorized, if any (no auth required).
    pub fn get_agent(env: Env, user: Address) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "agent"), user))
    }

    /// Split income on behalf of a user who authorized this agent. `payment_ref`
    /// identifies what triggered the split and can only be used once per user,
    /// so a redelivered payment can't be counted twice.
    pub fn agent_execute_split(
        env: Env,
        agent: Address,
        user: Address,
        income: i128,
        payment_ref: BytesN<32>,
    ) -> Vec<VaultBalance> {
        agent.require_auth();

        let agent_key = (Symbol::new(&env, "agent"), user.clone());
        let authorized: Option<Address> = env.storage().persistent().get(&agent_key);
        if authorized != Some(agent) {
            panic_with_error!(&env, SplitError::AgentNotAuthorized);
        }
        env.storage()
            .persistent()
            .extend_ttl(&agent_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        let ref_key = (Symbol::new(&env, "ref"), user.clone(), payment_ref);
        if env.storage().persistent().has(&ref_key) {
            panic_with_error!(&env, SplitError::PaymentAlreadySplit);
        }
        env.storage().persistent().set(&ref_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&ref_key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        Self::apply_split(&env, &user, income)
    }

    /// Up to a year of the user's splits, oldest first (no auth required).
    pub fn get_split_history(env: Env, user: Address) -> Vec<SplitRecord> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "hist"), user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn apply_split(env: &Env, user: &Address, income: i128) -> Vec<VaultBalance> {
        if income <= 0 {
            panic_with_error!(env, SplitError::InvalidIncome);
        }

        let rules = Self::load_rules(env, user);
        if rules.is_empty() {
            panic_with_error!(env, SplitError::NoRulesSet);
        }

        let bals_key = (Symbol::new(env, "bals"), user.clone());
        let mut balances = Self::load_balances(env, user);

        // FIX #4 — track every stroop distributed to compute remainder.
        let mut total_distributed: i128 = 0;

        for i in 0..rules.len() {
            let rule = rules.get(i).unwrap();
            let amount = match income.checked_mul(rule.percentage as i128) {
                Some(v) => v / 100,
                None => panic_with_error!(env, SplitError::InvalidIncome),
            };
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

        Self::record_split(env, user, income);
        Self::extend_instance(env);

        env.events().publish(
            (Symbol::new(env, "split_done"), user.clone()),
            income,
        );

        balances
    }

    /// Return current vault balances for a user (no auth required).
    pub fn get_balances(env: Env, user: Address) -> Vec<VaultBalance> {
        Self::load_balances(&env, &user)
    }

    /// Return stored split rules for a user (no auth required).
    pub fn get_rules(env: Env, user: Address) -> Vec<SplitRule> {
        Self::load_rules(&env, &user)
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

    fn load_rules(env: &Env, user: &Address) -> Vec<SplitRule> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, "rules"), user.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn load_balances(env: &Env, user: &Address) -> Vec<VaultBalance> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, "bals"), user.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn record_split(env: &Env, user: &Address, income: i128) {
        let key = (Symbol::new(env, "hist"), user.clone());
        let mut history: Vec<SplitRecord> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        let timestamp = env.ledger().timestamp();
        let record = SplitRecord { timestamp, income };

        match history.last() {
            Some(last) if last.timestamp / HISTORY_WINDOW_SECS == timestamp / HISTORY_WINDOW_SECS => {
                if income > last.income {
                    history.set(history.len() - 1, record);
                }
            }
            _ => {
                history.push_back(record);
                if history.len() > HISTORY_MAX_RECORDS {
                    history.pop_front();
                }
            }
        }

        env.storage().persistent().set(&key, &history);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }

    fn extend_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }
}

#[cfg(test)]
mod test;
