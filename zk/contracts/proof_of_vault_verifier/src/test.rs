//! ProofOfVaultVerifier tests. The VK and proof are real: the VK comes from
//! zk/scripts/vk_encoded.json, and the proof from public/zk's circuit artifacts
//! for FIXTURE_USER with threshold 50 USDC.

extern crate alloc;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl, Env};

const FIXTURE_USER: &str = "GB5TOC3CJ6OXV2BIMBM67S4XZINZPQSRQRYZK5577CE6TFXOBYUF3KSI";
const FIXTURE_A: &str = "093d03aa99209461687777fd45bec9c12f3548c9702b21e90d1d39ea581ef95419cd78d6fc881cf63363a6e27cf802ed0e44bc3bf55293895893cba2398e60a4d7c37686f76d8146afd35d53c3bc838e17604d7f65af41759bd08ebabc78a643";
const FIXTURE_B: &str = "1269f19b8c40f3ac7b82fbe282e16b3fff8f5748db6d7070a307b051add0f591db4dc354d3bf5e50fc85ee07c4436e81126c6b4da55d8857a1698c70f9a9e07a6bcbb3a14c7fe6518082ab80d9f72aa0e58e25f916879ca649f87e049dcdc2a5133c8d9b52cea7df405bc34c7b03b169670db2c76e6a606862ad4ac5055e0a4bd56bdaa292c0a7352f0618fc75536ce50f047ac84d69fa5e2ff963f4d63d9fb8d39ea4e6e6a1b6b0592dde927f84bc0a003ecf067a1b7d402b3bc7aadddaee6d";
const FIXTURE_C: &str = "0ad39ce49ec7f161da0289e76ba9229e87f57c554b2425b593b89aab2230a439eeb07afdd56493aa767b330020b5a7990ae8ca6304afba95b45e5f8e4a27e8a8d618507001a31302efc85d6b140f369740f4c8928f55fb23ca1cd956bac2920b";
const FIXTURE_THRESHOLD: &str = "000000000000000000000000000000000000000000000000000000001dcd6500";

/// Stands in for SplitProtocol's get_balances.
#[contract]
struct MockSplit;

#[contractimpl]
impl MockSplit {
    pub fn set_vault_2(env: Env, balance: i128) {
        env.storage().instance().set(&Symbol::new(&env, "balance"), &balance);
    }

    pub fn get_balances(env: Env, _user: Address) -> Vec<VaultBalance> {
        let balance: i128 = env.storage().instance().get(&Symbol::new(&env, "balance")).unwrap_or(0);
        Vec::from_array(&env, [VaultBalance { vault_id: 2, balance }])
    }
}

fn bytes<const N: usize>(env: &Env, hex: &str) -> BytesN<N> {
    let mut out = [0u8; N];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap();
    }
    BytesN::from_array(env, &out)
}

fn real_vk(env: &Env) -> VerificationKey {
    VerificationKey {
        alpha: bytes(env, "09085b41a83c12444016202a5fa259bb22ad16beba803e565b0ffbafe236c88ce8cf54688daddcc729cb061b4b448399069290fad2b4adca6a280ed58dd16e3f4abb5a4d12bf033cb7f4940a1db87dc460c5963cdf9c965deb7bd2a247b858f0"),
        beta: bytes(env, "005e926e8023e41a88bb1a531763cfa4e052d8494b27eac70d64e68606f8a857e68800850416121bcbdc4967bbf6f4af080e2b93bb17597a7caeb79fe64a631226e05a4e988f7d2648195ac7926807e93e4df97d6e477eb31585e0c60befba950bc23865496e70c1e5196f1c6cdedb7ff8317799143986338132dc206b8d98d7de8e53881b876133d759eb3d2b131491145123dd53e46875a71ae34865bdda4615e82c5cc59f212030f2b44b8ce9bb8fd4528cc9f3bd6c45438327a04185dd5c"),
        gamma: bytes(env, "13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801"),
        delta: bytes(env, "03ae94483c4621db0176727133ba3efacca6b10b55e1f22359bec427be06777bdded544831dc9f4b2efb4fdadd7c68730017c5e4a0d4748287e13e6b44bfa652b5ec03fd02cce5df37489147e2e8961d90d09314ca83bc3f34b67adfacff12f813166670527c9993d675c3c16afda4f01c2e8023d19b1a157195907a2658f554f03f1b118b39f3fc6bf4a1b698ed52a0155581a8d6b3819a391b0af82153e6e57ea858c60f440746752e6f4241841d7ac31c3870e2255f07ce962af6827dd07f"),
        ic_0: bytes(env, "172f972345fb8d865dd47c41dd6860838a6e31e9005fea877ad28c855e5bbad8a0caa89d6cdd3c08de8f1cb772bd6859125edbeae2f2c7de50e93f7306d03ab0f7aaa5adff848a898da602a221576013981f4c13a775cf78ff6f4c66d69fa1cb"),
        ic_1: bytes(env, "10ae4519a66843a8ecb688cc718fa3da07c2a48f74d21ce9f5655ce3016f40bdc61897afaff9272b639b0731050f28be00a2f901334f49bbc8b8f8e6f7a8fcfe7e75ab07dfeb32667d079c003b2dc13048a0abd3455c830a875b25e547defc84"),
        ic_2: bytes(env, "0d2ee2e523f96510234342a4eea810bbafda59dc508d12937862ba20db862a6a8dd9d8bd704937eda670a9f54d77731e0094abfb3526294cc1e0e79f8370a31acd490082bae404e4972a7cccc235988692defe4fec82133eacbdc76fbe1a4dd0"),
    }
}

fn proof(env: &Env) -> Proof {
    Proof {
        a: bytes(env, FIXTURE_A),
        b: bytes(env, FIXTURE_B),
        c: bytes(env, FIXTURE_C),
    }
}

fn setup<'a>(vault_2: i128) -> (Env, ProofOfVaultVerifierClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let split_id = env.register(MockSplit, ());
    MockSplitClient::new(&env, &split_id).set_vault_2(&vault_2);
    let id = env.register(ProofOfVaultVerifier, (Address::generate(&env), real_vk(&env), split_id));
    let client = ProofOfVaultVerifierClient::new(&env, &id);
    let user = Address::from_str(&env, FIXTURE_USER);
    (env, client, user)
}

const ENOUGH: i128 = 500_000_000;

#[test]
fn test_real_proof_with_real_balance_is_recorded_for_its_user() {
    let (env, client, user) = setup(ENOUGH);
    let nullifier = client.verify_proof(&user, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
    let record = client.get_proof(&nullifier).unwrap();
    assert_eq!(record.user, user);
    assert_eq!(record.threshold_usdc, ENOUGH);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_valid_proof_is_rejected_if_the_real_balance_is_lower() {
    let (env, client, user) = setup(ENOUGH - 1);
    client.verify_proof(&user, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_proof_cannot_be_used_by_another_account() {
    let (env, client, _) = setup(ENOUGH);
    let other = Address::generate(&env);
    client.verify_proof(&other, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_proof_cannot_be_used_for_another_threshold() {
    let (env, client, user) = setup(ENOUGH);
    let lower = "000000000000000000000000000000000000000000000000000000000bebc200";
    client.verify_proof(&user, &proof(&env), &bytes(&env, lower));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_threshold_with_upper_bytes_set_is_rejected() {
    let (env, client, user) = setup(ENOUGH);
    let inflated = "0000000000000000000000000000000100000000000000000000000000000000";
    client.verify_proof(&user, &proof(&env), &bytes(&env, inflated));
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_same_proof_cannot_be_submitted_twice() {
    let (env, client, user) = setup(ENOUGH);
    client.verify_proof(&user, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
    client.verify_proof(&user, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
}

#[test]
fn test_user_must_authorize_the_proof() {
    let (env, client, user) = setup(ENOUGH);
    client.verify_proof(&user, &proof(&env), &bytes(&env, FIXTURE_THRESHOLD));
    assert_eq!(env.auths()[0].0, user);
}
