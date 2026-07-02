// Proof-of-Vault — Noir circuit (artifact for Protocol 26 / UltraHonk)
//
// STATUS: Protocol 26 preview only — BN254 (CAP-0074) not yet live on public testnet.
// Use circuit.circom (Groth16/BLS12-381) for on-chain verification today.
// This file is ready to deploy when Protocol 26 is available on Stellar Testnet.
//
// When Protocol 26 is live:
//   nargo compile
//   bb prove -b target/proof_of_vault.json -w target/proof_of_vault.gz -o proof
//   bb verify -k target/vk -p proof

fn main(
    actual_balance: u64,   // private — never leaves the device
    threshold: pub u64,    // public  — what the user wants to prove
) {
    // Constraint: proof is invalid unless actual_balance >= threshold
    assert(actual_balance >= threshold, "Vault balance below threshold");
}

#[test]
fn test_proof_holds() {
    main(1000_0000000, 500_0000000); // 1000 USDC >= 500 USDC ✓
}

#[test(should_fail)]
fn test_proof_fails() {
    main(100_0000000, 500_0000000);  // 100 USDC < 500 USDC ✗
}
