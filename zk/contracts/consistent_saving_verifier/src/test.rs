//! ConsistentSavingVerifier tests.
//!
//! `FIXTURE_*` are the real outputs of a genuine Groth16Receipt, produced by
//! `zk/risc0/consistent_saving/host` (THRESHOLD_MONTHS=1) for a real testnet
//! account and split, and accepted by a testnet deployment on 2026-11-07. The
//! same bytes live in `zk/risc0/consistent_saving/fixture.json`. Fabricated
//! bytes would make the acceptance test pass for the wrong reason (a verifier
//! that accepts everything also passes a fake fixture).

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Env};

const FIXTURE_USER: &str = "GB5TOC3CJ6OXV2BIMBM67S4XZINZPQSRQRYZK5577CE6TFXOBYUF3KSI";
const FIXTURE_SEAL_HEX: &str = "2be75f4e560315f9d3b1b728715fed0115d1f5cc9a357011a3c9fdd258797b5224079b4ada4fed89fe553d643ed6c1d5f51c3f6e678c70e86f45a79b7a3c359a29fa138185570816915be6cb7a0cc9c8e3398010aa3b6e5ad0f57cdd22fc7c812f2bb0bca7f6a0e65e22fb8d63b23f18857b8ae04088bc5dc6ef3f939494e52c2cbc0082ee2e40400db4fe70cb6a2dd088ba844ff68bbe947a6e6824974c71e80d379417f9032b34302295fc258dd64ef0799df5d9d7858ee40fa239e8b549da279e3c13cd70b28f7533e75240f2d29e7884880f6e71c280ac847a9ce6355d090150692874ff39efb2f31ad0a637234a1b029bce5543021836e3befdc9640fb2";
const FIXTURE_JOURNAL_HEX: &str = "00000001000000010000000000989680000000006aeedc8a8f54913b3c12eb61ef9b1a9197c02fcfbe3e54a1132510ce7c83eba5ab25be94ee397a3a0c61fe6e78931c84554a1e8688b23f49d42e2af19cd110d8944b9326";
const FIXTURE_IMAGE_ID_HEX: &str = "f3f1170c1d2e5b67e154daba1a0249f78485e9cd64843bfb3d2f920bc12c42c7";
const FIXTURE_AS_OF: u64 = 1794038922;
const FIXTURE_SPLIT_TIMESTAMP: u64 = 1794038701;
const FIXTURE_SPLIT_INCOME: i128 = 250000000;

/// Stands in for SplitProtocol's get_split_history.
#[contract]
struct MockSplit;

#[contractimpl]
impl MockSplit {
    pub fn set_history(env: Env, history: Vec<SplitRecord>) {
        env.storage().instance().set(&Symbol::new(&env, "history"), &history);
    }

    pub fn get_split_history(env: Env, _user: Address) -> Vec<SplitRecord> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "history"))
            .unwrap_or_else(|| Vec::new(&env))
    }
}

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

struct Setup<'a> {
    env: Env,
    client: ConsistentSavingVerifierClient<'a>,
    split: MockSplitClient<'a>,
    user: Address,
}

fn setup<'a>(min_months: u32) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(FIXTURE_AS_OF + 600);

    let split_id = env.register(MockSplit, ());
    let split = MockSplitClient::new(&env, &split_id);
    split.set_history(&Vec::from_array(&env, [SplitRecord {
        timestamp: FIXTURE_SPLIT_TIMESTAMP,
        income: FIXTURE_SPLIT_INCOME,
    }]));

    let image_id: BytesN<32> = hex_to_bytesn(&env, FIXTURE_IMAGE_ID_HEX);
    let contract_id = env.register(
        ConsistentSavingVerifier,
        (Address::generate(&env), real_vk(&env), image_id, split_id, min_months),
    );
    let client = ConsistentSavingVerifierClient::new(&env, &contract_id);
    let user = Address::from_str(&env, FIXTURE_USER);
    Setup { env, client, split, user }
}

fn proof_from(env: &Env, seal: &[u8]) -> Groth16Proof {
    let mut a = [0u8; 64]; a.copy_from_slice(&seal[0..64]);
    let mut b = [0u8; 128]; b.copy_from_slice(&seal[64..192]);
    let mut c = [0u8; 64]; c.copy_from_slice(&seal[192..256]);
    Groth16Proof {
        a: BytesN::from_array(env, &a),
        b: BytesN::from_array(env, &b),
        c: BytesN::from_array(env, &c),
    }
}

fn fixture_proof(env: &Env) -> Groth16Proof {
    proof_from(env, &hex_bytes(FIXTURE_SEAL_HEX))
}

fn fixture_journal(env: &Env) -> Bytes {
    Bytes::from_slice(env, &hex_bytes(FIXTURE_JOURNAL_HEX))
}

#[test]
fn test_real_proof_is_recorded_for_its_user_without_their_signature() {
    let Setup { env, client, user, .. } = setup(1);
    let nullifier = client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));

    assert!(env.auths().is_empty());
    let record = client.get_proof(&nullifier).unwrap();
    assert_eq!(record.user, user);
    assert_eq!(record.months_with_saving, 1);
    assert_eq!(record.threshold_months, 1);
}

#[test]
#[should_panic(expected = "Error(Crypto, InvalidInput)")]
fn test_tampered_seal_is_rejected() {
    let Setup { env, client, user, .. } = setup(1);
    let mut seal = hex_bytes(FIXTURE_SEAL_HEX);
    seal[200] ^= 0x01;
    client.verify_proof(&user, &proof_from(&env, &seal), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_edited_journal_is_rejected() {
    let Setup { env, client, user, .. } = setup(1);
    let mut journal = hex_bytes(FIXTURE_JOURNAL_HEX);
    journal[3] = 12; // claim 12 months instead of 1
    client.verify_proof(&user, &fixture_proof(&env), &Bytes::from_slice(&env, &journal));
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_proof_cannot_be_claimed_by_another_account() {
    let Setup { env, client, .. } = setup(1);
    let other = Address::generate(&env);
    client.verify_proof(&other, &fixture_proof(&env), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_threshold_below_the_deployments_minimum_is_rejected() {
    let Setup { env, client, user, .. } = setup(6);
    client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_old_proof_is_rejected() {
    let Setup { env, client, user, .. } = setup(1);
    env.ledger().set_timestamp(FIXTURE_AS_OF + MAX_PROOF_AGE_SECS + 1);
    client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_proof_over_a_different_history_is_rejected() {
    let Setup { env, client, split, user } = setup(1);
    split.set_history(&Vec::from_array(&env, [SplitRecord {
        timestamp: FIXTURE_SPLIT_TIMESTAMP,
        income: FIXTURE_SPLIT_INCOME + 1,
    }]));
    client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_same_proof_cannot_be_submitted_twice() {
    let Setup { env, client, user, .. } = setup(1);
    client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));
    client.verify_proof(&user, &fixture_proof(&env), &fixture_journal(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_journal_of_the_wrong_size_is_rejected() {
    let Setup { env, client, user, .. } = setup(1);
    client.verify_proof(&user, &fixture_proof(&env), &Bytes::from_slice(&env, &[0u8; 20]));
}
