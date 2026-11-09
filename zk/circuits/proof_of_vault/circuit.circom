pragma circom 2.0.0;

// GreaterEqThan comparator from circomlib
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * ProofOfVault — range proof for Stellar/Propulsor
 *
 * Proves knowledge of a balance >= threshold, for one specific account.
 *
 * Private input:
 *   actual_balance — vault_2 balance in USDC base units (7 decimals)
 *
 * Public inputs:
 *   threshold      — minimum balance to prove (same units)
 *   user_binding   — sha256(account's Address XDR) with its first byte cleared
 *
 * ProofOfVaultVerifier recomputes user_binding and checks the real balance in
 * SplitProtocol, since this circuit can't know whether actual_balance is true.
 *
 * Proof system : Groth16
 * Curve        : BLS12-381  (compile with: circom circuit.circom --r1cs --wasm -p bls12381)
 */
template ProofOfVault() {
    signal input actual_balance;
    signal input threshold;
    signal input user_binding;

    // The comparator only works on inputs that fit its bit width
    component balance_bits = Num2Bits(64);
    balance_bits.in <== actual_balance;
    component threshold_bits = Num2Bits(64);
    threshold_bits.in <== threshold;

    component gte = GreaterEqThan(64);
    gte.in[0] <== actual_balance;
    gte.in[1] <== threshold;
    gte.out === 1;

    // Puts user_binding in a constraint so it can't be optimized out of the proof
    signal user_binding_squared;
    user_binding_squared <== user_binding * user_binding;
}

component main { public [threshold, user_binding] } = ProofOfVault();
