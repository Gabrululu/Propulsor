#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error,
    Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// TTL constants — same rationale as split_protocol.
// A vault for "Meta grande" may be untouched for years; persistent entries
// must be explicitly extended or they get archived by the network.
// ---------------------------------------------------------------------------
const LEDGER_THRESHOLD: u32 = 518_400;   // 30 days  (~5s/ledger)
const LEDGER_EXTEND_TO: u32 = 3_110_400; // 180 days (network max)

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct VaultLock {
    pub vault_id:         u32,
    pub locked_amount:    i128,
    pub unlock_timestamp: Option<u64>,   // Unix timestamp; None = no time lock
    pub goal_amount:      Option<i128>,  // None = no goal lock; must be > 0
    pub created_at:       u64,           // env.ledger().timestamp() at lock time
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq)]
pub enum VaultError {
    LockNotMet    = 1,
    NoLockFound   = 2,
    InvalidParams = 3, // bad vault_id, bad goal_amount, or no condition given
    AlreadyLocked = 4,
    InvalidAmount = 5,
    TimestampPast = 6,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct TimeVault;

#[contractimpl]
impl TimeVault {
    /// Lock funds in a vault under a time condition, a goal condition, or both.
    ///
    /// Constraints enforced:
    ///   - vault_id must be 0, 1, or 2
    ///   - amount must be > 0
    ///   - at least one of unlock_timestamp / goal_amount must be Some
    ///   - unlock_timestamp (if set) must be strictly in the future
    ///   - goal_amount (if set) must be > 0
    pub fn lock_vault(
        env: Env,
        user: Address,
        vault_id: u32,
        amount: i128,
        unlock_timestamp: Option<u64>,
        goal_amount: Option<i128>,
    ) {
        user.require_auth();

        // FIX #5 — constrain vault_id to the three defined vaults.
        if vault_id > 2 {
            panic_with_error!(&env, VaultError::InvalidParams);
        }

        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        if unlock_timestamp.is_none() && goal_amount.is_none() {
            panic_with_error!(&env, VaultError::InvalidParams);
        }

        if let Some(ts) = unlock_timestamp {
            if ts <= env.ledger().timestamp() {
                panic_with_error!(&env, VaultError::TimestampPast);
            }
        }

        // FIX #2 — goal_amount = 0 or negative would make the lock immediately
        // releasable (locked_amount >= 0 is always true), defeating the purpose.
        if let Some(goal) = goal_amount {
            if goal <= 0 {
                panic_with_error!(&env, VaultError::InvalidParams);
            }
        }

        let key = (Symbol::new(&env, "lock"), user.clone(), vault_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, VaultError::AlreadyLocked);
        }

        let lock = VaultLock {
            vault_id,
            locked_amount: amount,
            unlock_timestamp,
            goal_amount,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &lock);
        // FIX #1 — extend TTL so the lock survives while the user saves.
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "locked"), user, vault_id),
            amount,
        );
    }

    /// Returns true when the vault is free to release.
    /// A vault with no lock is considered already released (returns true).
    /// At least ONE of the configured conditions must be satisfied.
    pub fn check_release(env: Env, user: Address, vault_id: u32) -> bool {
        let key = (Symbol::new(&env, "lock"), user, vault_id);
        let lock: VaultLock = match env.storage().persistent().get(&key) {
            None => return true,
            Some(l) => l,
        };

        let now = env.ledger().timestamp();

        let time_ok = lock
            .unlock_timestamp
            .map(|ts| now >= ts)
            .unwrap_or(false);

        let goal_ok = lock
            .goal_amount
            .map(|goal| lock.locked_amount >= goal)
            .unwrap_or(false);

        time_ok || goal_ok
    }

    /// Release the vault and return the locked amount.
    /// Panics with `LockNotMet` if neither condition is satisfied yet.
    pub fn release_vault(env: Env, user: Address, vault_id: u32) -> i128 {
        user.require_auth();

        let key = (Symbol::new(&env, "lock"), user.clone(), vault_id);
        let lock: VaultLock = match env.storage().persistent().get(&key) {
            Some(l) => l,
            None => panic_with_error!(&env, VaultError::NoLockFound),
        };

        // Inline check_release logic — storage is cleared before returning so
        // there is no intermediate state that a reentrant call could exploit.
        let now = env.ledger().timestamp();
        let time_ok = lock
            .unlock_timestamp
            .map(|ts| now >= ts)
            .unwrap_or(false);
        let goal_ok = lock
            .goal_amount
            .map(|goal| lock.locked_amount >= goal)
            .unwrap_or(false);

        if !time_ok && !goal_ok {
            panic_with_error!(&env, VaultError::LockNotMet);
        }

        let amount = lock.locked_amount;
        // Remove before emitting the event — checks-effects-interactions order.
        env.storage().persistent().remove(&key);

        env.events().publish(
            (Symbol::new(&env, "released"), user, vault_id),
            amount,
        );

        amount
    }

    /// Add more funds to an existing lock (called by split_protocol over time).
    pub fn add_to_lock(env: Env, user: Address, vault_id: u32, amount: i128) {
        user.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let key = (Symbol::new(&env, "lock"), user.clone(), vault_id);
        let mut lock: VaultLock = match env.storage().persistent().get(&key) {
            Some(l) => l,
            None => panic_with_error!(&env, VaultError::NoLockFound),
        };

        lock.locked_amount += amount;
        env.storage().persistent().set(&key, &lock);
        // FIX #1 — refresh TTL on every deposit so the lock doesn't expire
        // between the user's periodic contributions.
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "added"), user, vault_id),
            amount,
        );
    }

    /// Return the lock for a vault, or None if there is no active lock.
    pub fn get_lock(env: Env, user: Address, vault_id: u32) -> Option<VaultLock> {
        let key = (Symbol::new(&env, "lock"), user, vault_id);
        env.storage().persistent().get(&key)
    }

    /// Seconds remaining until time condition is met.
    /// Returns 0 if there is no lock or no time condition.
    /// Returns a negative value when the unlock time has already passed.
    pub fn get_time_remaining(env: Env, user: Address, vault_id: u32) -> i64 {
        let key = (Symbol::new(&env, "lock"), user, vault_id);
        let lock: VaultLock = match env.storage().persistent().get(&key) {
            None => return 0,
            Some(l) => l,
        };
        match lock.unlock_timestamp {
            None => 0,
            Some(ts) => (ts as i64) - (env.ledger().timestamp() as i64),
        }
    }
}

#[cfg(test)]
mod test;
