//! ConsistentSavingVerifier tests.
//!
//! `FIXTURE_*` below are the real seal/journal/image_id bytes from a genuine
//! Groth16Receipt, produced by
//! `zk/risc0/consistent_saving/host/examples/crosscheck_fixture.rs`
//! (2026-08-21 run — synthetic 7-qualifying-months-out-of-12 input, threshold
//! 6), which also independently confirmed these bytes verify via a
//! from-scratch ark-groth16 reimplementation, deliberately not calling into
//! risc0-groth16's own verifier — see SPEC.md. `real_vk` below is RISC Zero's
//! published Groth16 VK (SPEC.md §2), encoded via
//! `zk/scripts/encode_risc0_vk.ts` -> `zk/scripts/vk_risc0_encoded.json`.
//! Using fabricated bytes here would make `test_valid_proof_accepted` pass
//! for the wrong reason (a verifier that accepts everything also passes a
//! fake fixture) and defeat the point of this regression guard.
//! `test_tampered_proof_rejected` guards against the opposite failure mode
//! (a verifier that's subtly wrong and rejects everything, including real
//! proofs, silently "failing safe" but useless).

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

// From zk/risc0/consistent_saving/fixture.json (crosscheck_fixture.rs, 2026-08-21).
const FIXTURE_SEAL_HEX: &str = "0b5019d6547534c79f66d960d5a7ecf4407dde7f75eb30657c38fbbc742bb06f15304c633c97dea1bdbe4f55292401d2d91d81ef1722b8aad1487b210110667d27caf76024b7d67b673cb798a9f9a5df79eaac3243c83e477b409ec269e8fd900c106a268308166fb991e402d9f20172ffc55dc35cc41e57f8512264cf7e39bb085ba76016b8cef3cf7b9dcf8991bd60247c9eb32ad559b951fc8ac624d2a67d295d2d542ce22b86d6456f7bef6bf603abe3502fd648541a2aa9d90c1489d9a11953463c7c57baf60ca59c5f92948af8b0dfac4d3f6d7e037dc5178386a9124e156fb13ae553bb3b25e84a09bac4d28b8574544863e5f6febb72e13345902dcb";
const FIXTURE_JOURNAL_HEX: &str = "0700000006000000809698000000000001000000";
const FIXTURE_IMAGE_ID_HEX: &str = "ca2fb8df3bbd29bccf510886b898f64d62aa4242cd483bdfcbfeddd2ae9ead45";

// RISC Zero's published Groth16 VK (SPEC.md §2), from
// zk/scripts/vk_risc0_encoded.json — the same VK the crosscheck fixture's
// proof was generated and independently re-verified against.
fn real_vk(env: &Env) -> VerificationKey {
    VerificationKey {
        alpha: hex_to_bytesn(env, "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926"),
        beta: hex_to_bytesn(env, "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8"),
        gamma: hex_to_bytesn(env, "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa"),
        delta: hex_to_bytesn(env, "03b03cd5effa95ac9bee94f1f5ef907157bda4812ccf0b4c91f42bb629f83a1c1aa085ff28179a12d922dba0547057ccaae94b9d69cfaa4e60401fea7f3e0333110c10134f200b19f6490846d518c9aea868366efb7228ca5c91d2940d0307621e60f31fcbf757e837e867178318832d0b2d74d59e2fea1c7142df187d3fc6d3"),
        ic_0: hex_to_bytesn(env, "12ac9a25dcd5e1a832a9061a082c15dd1d61aa9c4d553505739d0f5d65dc3be4025aa744581ebe7ad91731911c898569106ff5a2d30f3eee2b23c60ee980acd4"),
        ic_1: hex_to_bytesn(env, "0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f2e32a094b7589554f7bc357bf63481acd2d55555c203383782a4650787ff6642"),
        ic_2: hex_to_bytesn(env, "0bca36e2cbe6394b3e249751853f961511011c7148e336f4fd974644850fc3472ede7c9acf48cf3a3729fa3d68714e2a8435d4fa6db8f7f409c153b1fcdf9b8b"),
        ic_3: hex_to_bytesn(env, "1b8af999dbfbb3927c091cc2aaf201e488cbacc3e2c6b6fb5a25f9112e04f2a72b91a26aa92e1b6f5722949f192a81c850d586d81a60157f3e9cf04f679cccd6"),
        ic_4: hex_to_bytesn(env, "2b5f494ed674235b8ac1750bdfd5a7615f002d4a1dcefeddd06eda5a076ccd0d2fe520ad2020aab9cbba817fcbb9a863b8a76ff88f14f912c5e71665b2ad5e82"),
        ic_5: hex_to_bytesn(env, "0f1c3c0d5d9da0fa03666843cde4e82e869ba5252fce3c25d5940320b1c4d493214bfcff74f425f6fe8c0d07b307482d8bc8bb2f3608f68287aa01bd0b69e809"),
    }
}

fn hex_to_bytesn<const N: usize>(env: &Env, hex_str: &str) -> BytesN<N> {
    let bytes = hex_bytes(hex_str);
    assert_eq!(bytes.len(), N, "fixture hex length mismatch for BytesN<{N}>");
    let mut arr = [0u8; N];
    arr.copy_from_slice(&bytes);
    BytesN::from_array(env, &arr)
}

fn hex_bytes(s: &str) -> alloc::vec::Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

#[test]
fn test_constructor() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let vk = real_vk(&env);
    let image_id = BytesN::from_array(&env, &[0u8; 32]);
    let contract_id = env.register(ConsistentSavingVerifier, (admin.clone(), vk.clone(), image_id));
    let stored_vk: VerificationKey = env.as_contract(&contract_id, || {
        env.storage().instance().get(&DataKey::Vk).unwrap()
    });
    assert_eq!(stored_vk.alpha, vk.alpha);
}

#[test]
fn test_valid_proof_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let vk = real_vk(&env);
    let image_id: BytesN<32> = hex_to_bytesn(&env, FIXTURE_IMAGE_ID_HEX);
    let contract_id = env.register(ConsistentSavingVerifier, (admin, vk, image_id));

    let seal_bytes = hex_bytes(FIXTURE_SEAL_HEX);
    let mut a = [0u8; 64]; a.copy_from_slice(&seal_bytes[0..64]);
    let mut b = [0u8; 128]; b.copy_from_slice(&seal_bytes[64..192]);
    let mut c = [0u8; 64]; c.copy_from_slice(&seal_bytes[192..256]);
    let proof = Groth16Proof {
        a: BytesN::from_array(&env, &a),
        b: BytesN::from_array(&env, &b),
        c: BytesN::from_array(&env, &c),
    };
    let journal_bytes = hex_bytes(FIXTURE_JOURNAL_HEX);
    let journal = Bytes::from_slice(&env, &journal_bytes);

    env.as_contract(&contract_id, || {
        let nullifier = ConsistentSavingVerifier::verify_proof(env.clone(), user, proof, journal);
        assert!(ConsistentSavingVerifier::is_used(env.clone(), nullifier));
    });
}

#[test]
#[should_panic]
fn test_tampered_proof_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let vk = real_vk(&env);
    let image_id: BytesN<32> = hex_to_bytesn(&env, FIXTURE_IMAGE_ID_HEX);
    let contract_id = env.register(ConsistentSavingVerifier, (admin, vk, image_id));

    let mut seal_bytes = hex_bytes(FIXTURE_SEAL_HEX);
    seal_bytes[0] ^= 0xFF; // flip a byte in the proof — must be rejected
    let mut a = [0u8; 64]; a.copy_from_slice(&seal_bytes[0..64]);
    let mut b = [0u8; 128]; b.copy_from_slice(&seal_bytes[64..192]);
    let mut c = [0u8; 64]; c.copy_from_slice(&seal_bytes[192..256]);
    let proof = Groth16Proof {
        a: BytesN::from_array(&env, &a),
        b: BytesN::from_array(&env, &b),
        c: BytesN::from_array(&env, &c),
    };
    let journal_bytes = hex_bytes(FIXTURE_JOURNAL_HEX);
    let journal = Bytes::from_slice(&env, &journal_bytes);

    env.as_contract(&contract_id, || {
        ConsistentSavingVerifier::verify_proof(env.clone(), user, proof, journal);
    });
}
