pragma circom 2.0.0;

// GreaterEqThan comparator from circomlib
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * ProofOfVault — Range proof for Stellar/Propulsor
 *
 * Proves that a vault balance satisfies a minimum threshold
 * WITHOUT revealing the exact balance.
 *
 * Private inputs (never leave the device):
 *   actual_balance  — vault_2 balance in USDC base units (7 decimals)
 *
 * Public inputs (visible to verifier):
 *   threshold       — minimum balance to prove (same units)
 *
 * Constraint:
 *   actual_balance >= threshold   (proof fails if not satisfied)
 *
 * Proof system : Groth16
 * Curve        : BLS12-381  (compile with: circom circuit.circom --r1cs --wasm -p bls12381)
 * Verifier     : ProofOfVaultVerifier Soroban contract
 */
template ProofOfVault() {
    // ── Signals ──────────────────────────────────────────────
    signal input actual_balance;   // private — stays on device
    signal input threshold;        // public  — included in public.json

    // ── Constraint ───────────────────────────────────────────
    // GreaterEqThan(n) requires n-bit inputs → use 64 for u64 USDC amounts
    component gte = GreaterEqThan(64);
    gte.in[0] <== actual_balance;
    gte.in[1] <== threshold;

    // Force the circuit to fail if the constraint is not satisfied.
    // A valid proof guarantees gte.out == 1 (actual_balance >= threshold).
    gte.out === 1;
}

// threshold is the public input; actual_balance stays private
component main { public [threshold] } = ProofOfVault();
