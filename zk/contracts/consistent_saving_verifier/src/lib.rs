#![no_std]

//! ConsistentSavingVerifier — Groth16 / BN254 on-chain verifier for Propulsor
//!
//! Verifies a RISC Zero `Groth16Receipt` proving a user completed splits in
//! >= threshold_months distinct months out of the last 12, without revealing
//! individual amounts. See `zk/risc0/consistent_saving/SPEC.md` for the full,
//! source-cited derivation of every formula below — this file is written to
//! mirror that spec section-by-section (search for "SPEC.md §" comments).
//!
//! Unlike `proof_of_vault_verifier` (BLS12-381, a circuit Propulsor authored
//! and ran its own trusted setup for), this verifying key is RISC Zero's own
//! published Groth16 wrapper VK — same one risc0-ethereum's on-chain Solidity
//! verifier uses. No new trusted setup. See SPEC.md §2.
//!
//! Groth16 verification equation (same shape as proof_of_vault_verifier, but
//! 5 public inputs instead of 1 — SPEC.md §1):
//!   e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
//!   vk_x = IC[0] + IC[1]·a0 + IC[2]·a1 + IC[3]·c0 + IC[4]·c1 + IC[5]·id_bn254_fr
//!
//! Where (a0, a1) and id_bn254_fr are FIXED (derived once from RISC Zero's
//! ALLOWED_CONTROL_ROOT / BN254_IDENTITY_CONTROL_ID — SPEC.md §3a) and (c0, c1)
//! are derived per-call from (image_id, journal) — SPEC.md §3c/§3d.
//!
//! Requires soroban-sdk >= 25.0.0 (CAP-0074 BN254 host functions, Protocol 25+).

extern crate alloc;

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    Address, Bytes, BytesN, Env, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEDGER_THRESHOLD: u32 = 518_400;    // 30 days
const LEDGER_EXTEND_TO: u32 = 3_110_400;  // 180 days

// SPEC.md §3a: fixed public-input scalars, same for every proof from this
// risc0-zkvm version (only (c0, c1), derived per-call from the journal, vary
// — see verify_proof). Big-endian 32-byte Fr encodings, derived from
// ALLOWED_CONTROL_ROOT / BN254_IDENTITY_CONTROL_ID (risc0-circuit-recursion's
// control_id.rs) and confirmed against a real Groth16Receipt in
// host/examples/crosscheck_fixture.rs (Phase 1 exit criteria, 2026-08-21).
const ROOT_A0: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x41, 0xaf, 0x18, 0x73, 0x6d, 0xc9, 0xd7, 0x92, 0x1c, 0x85, 0x9f, 0xc9, 0x5a, 0xc8,
    0x4d, 0xa5,
];
const ROOT_A1: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x56, 0x1f, 0x8c, 0x99, 0x2a, 0x42, 0x4d, 0xeb, 0x37, 0xcc, 0xdf, 0x4e, 0x19, 0xc0,
    0xe7, 0xdb,
];
const ID_BN254_FR: [u8; 32] = [
    0x04, 0x44, 0x6e, 0x66, 0xd3, 0x00, 0xeb, 0x7f, 0xb4, 0x5c, 0x97, 0x26, 0xbb, 0x53, 0xc7,
    0x93, 0xdd, 0xa4, 0x07, 0xa6, 0x2e, 0x96, 0x01, 0x61, 0x8b, 0xb4, 0x3c, 0x5c, 0x14, 0x65,
    0x7a, 0xc0,
];

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Groth16 proof ("seal" in RISC Zero terminology). Raw 256-byte layout
/// (a || b || c, big-endian) slices directly into these three fields with no
/// reordering — confirmed in SPEC.md §4.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// RISC Zero's published Groth16 verifying key (SPEC.md §2) — same for every
/// deployment of this contract, encoded once via
/// `zk/scripts/encode_risc0_vk.ts` and passed to `__constructor`.
#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic_0: BytesN<64>,
    pub ic_1: BytesN<64>,
    pub ic_2: BytesN<64>,
    pub ic_3: BytesN<64>,
    pub ic_4: BytesN<64>,
    pub ic_5: BytesN<64>,
}

/// Record stored for each accepted proof.
#[contracttype]
#[derive(Clone)]
pub struct ProofRecord {
    pub user: Address,
    pub months_with_saving: u32,
    pub threshold_months: u32,
    pub ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Vk,
    Admin,
    ImageId,
    Nullifier(BytesN<32>), // sha256(seal) -> ProofRecord
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, PartialEq)]
pub enum VerifierError {
    NotInitialized = 2,
    InvalidProof = 3,
    ReplayAttack = 4,
    InvalidJournal = 5,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct ConsistentSavingVerifier;

#[contractimpl]
impl ConsistentSavingVerifier {

    // ── Constructor (Protocol 22+) ─────────────────────────────────────────

    /// Called once at deploy time. `image_id` is the guest ELF's image ID
    /// (methods::CONSISTENT_SAVING_ID from the RISC Zero build — SPEC.md §3d).
    pub fn __constructor(env: Env, admin: Address, vk: VerificationKey, image_id: BytesN<32>) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vk, &vk);
        env.storage().instance().set(&DataKey::ImageId, &image_id);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_EXTEND_TO);
    }

    // ── Core verification ──────────────────────────────────────────────────

    /// Verify a Groth16/BN254 receipt proving consistent-saving behavior and
    /// store the result on-chain.
    ///
    /// Parameters:
    ///   user    — the account making the claim (must sign)
    ///   proof   — the Groth16 seal (a, b, c), sliced directly from
    ///             Groth16Receipt.seal — see SPEC.md §4
    ///   journal — the guest's public output bytes (Journal struct, risc0-serde
    ///             encoded) — used to reconstruct the claim digest, SPEC.md §3d
    ///
    /// Returns the nullifier (sha256 of the seal) — use as proof_hash in the UI.
    pub fn verify_proof(
        env: Env,
        user: Address,
        proof: Groth16Proof,
        journal: Bytes,
    ) -> BytesN<32> {
        user.require_auth();

        let vk: VerificationKey = env.storage().instance()
            .get(&DataKey::Vk)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierError::NotInitialized));
        let image_id: BytesN<32> = env.storage().instance()
            .get(&DataKey::ImageId)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierError::NotInitialized));

        // ── Replay protection ─────────────────────────────────────────────
        // Nullifier = sha256(a || b || c) — unique per proof, same pattern as
        // proof_of_vault_verifier.
        let mut seal_bytes = Bytes::new(&env);
        seal_bytes.extend_from_array(&proof.a.to_array());
        seal_bytes.extend_from_array(&proof.b.to_array());
        seal_bytes.extend_from_array(&proof.c.to_array());
        let nullifier: BytesN<32> = env.crypto().sha256(&seal_bytes).into();

        if env.storage().persistent().has(&DataKey::Nullifier(nullifier.clone())) {
            panic_with_error!(&env, VerifierError::ReplayAttack);
        }

        // ── Reconstruct public inputs (SPEC.md §3) ─────────────────────────
        let claim = Self::claim_digest(&env, &image_id, &journal);
        let (c0, c1) = Self::split_digest(&env, &claim);

        // SPEC.md §3a: (a0, a1) split of ALLOWED_CONTROL_ROOT and
        // BN254_IDENTITY_CONTROL_ID as an Fr, both fixed for this
        // risc0-zkvm version. Confirmed 2026-08-21 via
        // host/examples/crosscheck_fixture.rs (printed decimal values,
        // cross-checked with a second, independent ark-bn254-only example
        // that reads the same risc0-circuit-recursion constants and prints
        // their big-endian byte encoding directly) and via the full
        // crosscheck's `✓ PASSED` real-receipt verification (Phase 1 exit
        // criteria) — see SPEC.md for the derivation.
        let root_a0 = Self::const_fr(&env, &ROOT_A0);
        let root_a1 = Self::const_fr(&env, &ROOT_A1);
        let id_bn254_fr = Self::const_fr(&env, &ID_BN254_FR);

        let bn254 = env.crypto().bn254();

        // ── vk_x = IC[0] + IC[1]*a0 + IC[2]*a1 + IC[3]*c0 + IC[4]*c1 + IC[5]*id ──
        let ic0 = Bn254G1Affine::from_bytes(vk.ic_0.clone());
        let scalars: Vec<Bn254Fr> = Vec::from_array(&env, [root_a0, root_a1, c0, c1, id_bn254_fr]);
        let points: Vec<Bn254G1Affine> = Vec::from_array(&env, [
            Bn254G1Affine::from_bytes(vk.ic_1.clone()),
            Bn254G1Affine::from_bytes(vk.ic_2.clone()),
            Bn254G1Affine::from_bytes(vk.ic_3.clone()),
            Bn254G1Affine::from_bytes(vk.ic_4.clone()),
            Bn254G1Affine::from_bytes(vk.ic_5.clone()),
        ]);
        let msm = bn254.g1_msm(points, scalars);
        let vk_x = bn254.g1_add(&ic0, &msm);

        // ── e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) == 1 ──────────────────
        let neg_a = Self::g1_neg(&env, &proof.a);
        let g1_points: Vec<Bn254G1Affine> = Vec::from_array(&env, [
            Bn254G1Affine::from_bytes(neg_a),
            Bn254G1Affine::from_bytes(vk.alpha.clone()),
            vk_x,
            Bn254G1Affine::from_bytes(proof.c.clone()),
        ]);
        let g2_points: Vec<Bn254G2Affine> = Vec::from_array(&env, [
            Bn254G2Affine::from_bytes(proof.b.clone()),
            Bn254G2Affine::from_bytes(vk.beta.clone()),
            Bn254G2Affine::from_bytes(vk.gamma.clone()),
            Bn254G2Affine::from_bytes(vk.delta.clone()),
        ]);

        if !bn254.pairing_check(g1_points, g2_points) {
            panic_with_error!(&env, VerifierError::InvalidProof);
        }

        // ── Parse journal for the ProofRecord (SPEC.md note above) ─────────
        let (months_with_saving, threshold_months) = Self::parse_journal(&env, &journal);

        let record = ProofRecord {
            user: user.clone(),
            months_with_saving,
            threshold_months,
            ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&DataKey::Nullifier(nullifier.clone()), &record);
        env.storage().persistent().extend_ttl(
            &DataKey::Nullifier(nullifier.clone()),
            LEDGER_THRESHOLD,
            LEDGER_EXTEND_TO,
        );

        env.events().publish(
            (Symbol::new(&env, "ConsistentSavingVerified"),),
            (user, months_with_saving, threshold_months, nullifier.clone()),
        );

        nullifier
    }

    // ── Read-only queries ──────────────────────────────────────────────────

    pub fn get_proof(env: Env, nullifier: BytesN<32>) -> Option<ProofRecord> {
        env.storage().persistent().get(&DataKey::Nullifier(nullifier))
    }

    pub fn is_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier))
    }

    // ── Internal helpers ───────────────────────────────────────────────────

    /// SPEC.md §3d: tagged_struct(tag, down: &[Digest], data: &[u32]) -> Digest
    fn tagged_struct(env: &Env, tag: &str, down: &[BytesN<32>], data: &[u32]) -> BytesN<32> {
        let tag_digest: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(env, tag.as_bytes())).into();
        let mut buf = Bytes::new(env);
        buf.extend_from_array(&tag_digest.to_array());
        for d in down {
            buf.extend_from_array(&d.to_array());
        }
        for w in data {
            buf.extend_from_array(&w.to_le_bytes());
        }
        let down_count: u16 = down.len() as u16;
        buf.extend_from_array(&down_count.to_le_bytes());
        env.crypto().sha256(&buf).into()
    }

    const ZERO_DIGEST: [u8; 32] = [0u8; 32];

    /// SPEC.md §3c/§3d: claim_digest for a ReceiptClaim::ok(image_id, journal)
    /// — our guest always halts normally with no assumptions/input.
    fn claim_digest(env: &Env, image_id: &BytesN<32>, journal: &Bytes) -> BytesN<32> {
        let zero = BytesN::from_array(env, &Self::ZERO_DIGEST);
        let journal_digest: BytesN<32> = env.crypto().sha256(journal).into();
        let output_digest = Self::tagged_struct(env, "risc0.Output", &[journal_digest, zero.clone()], &[]);
        let system_state_digest = Self::tagged_struct(env, "risc0.SystemState", &[zero.clone()], &[0]);
        Self::tagged_struct(
            env,
            "risc0.ReceiptClaim",
            &[zero, image_id.clone(), system_state_digest, output_digest],
            &[0, 0], // ExitCode::Halted(0).into_pair()
        )
    }

    /// SPEC.md §3b: split a 32-byte digest into two Bn254Fr scalars.
    ///
    /// risc0's split_digest does two byte-reversals that cancel out
    /// algebraically (see SPEC.md §3b derivation), leaving: each 16-byte half
    /// of the digest, taken in its native order, is a LITTLE-ENDIAN-encoded
    /// integer (ark-bn254 convention). Soroban's Bn254Fr::from_bytes expects
    /// BIG-ENDIAN — hence the byte reversal below is real (not cancelled),
    /// converting LE -> BE, plus zero-extension from 16 to 32 bytes.
    fn split_digest(env: &Env, d: &BytesN<32>) -> (Bn254Fr, Bn254Fr) {
        let bytes = d.to_array();
        let mut lo_be = [0u8; 32];
        let mut hi_be = [0u8; 32];
        for i in 0..16 {
            lo_be[31 - i] = bytes[i];
            hi_be[31 - i] = bytes[16 + i];
        }
        let a0 = Bn254Fr::from_bytes(BytesN::from_array(env, &lo_be));
        let a1 = Bn254Fr::from_bytes(BytesN::from_array(env, &hi_be));
        (a0, a1)
    }

    /// Build a Bn254Fr constant from a big-endian 32-byte array.
    fn const_fr(env: &Env, be_bytes: &[u8; 32]) -> Bn254Fr {
        Bn254Fr::from_bytes(BytesN::from_array(env, be_bytes))
    }

    /// Negate a G1 point: (x, y) -> (x, p - y), where p is the BN254 base
    /// field modulus. Needed because Soroban's bn254 API has no g1_neg host
    /// function (unlike proof_of_vault_verifier's client-side pre-negation
    /// for BLS12-381) — negation happens on-chain here instead.
    fn g1_neg(env: &Env, point: &BytesN<64>) -> BytesN<64> {
        const P: [u8; 32] = [
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81,
            0x58, 0x5d, 0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16,
            0xd8, 0x7c, 0xfd, 0x47,
        ];
        let bytes = point.to_array();
        let mut y = [0u8; 32];
        y.copy_from_slice(&bytes[32..64]);
        // If y == 0 (point at infinity's y-coordinate convention), negation is a no-op.
        if y == [0u8; 32] {
            return point.clone();
        }
        let neg_y = Self::be_sub(&P, &y);
        let mut out = [0u8; 64];
        out[0..32].copy_from_slice(&bytes[0..32]);
        out[32..64].copy_from_slice(&neg_y);
        BytesN::from_array(env, &out)
    }

    /// Big-endian 256-bit subtraction: a - b, assuming a >= b (true for p - y
    /// with a valid field element y < p).
    fn be_sub(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
        let mut out = [0u8; 32];
        let mut borrow: i16 = 0;
        for i in (0..32).rev() {
            let mut diff = a[i] as i16 - b[i] as i16 - borrow;
            if diff < 0 {
                diff += 256;
                borrow = 1;
            } else {
                borrow = 0;
            }
            out[i] = diff as u8;
        }
        out
    }

    /// Parse the guest's journal (risc0-serde-encoded Journal struct) to
    /// extract months_with_saving / threshold_months for the ProofRecord.
    ///
    /// Confirmed 2026-08-21 against a real fixture (fixture.json's
    /// journal_hex, from crosscheck_fixture.rs's synthetic 7/12-months input):
    /// risc0-serde encodes each field word-aligned, so the two leading u32
    /// fields land at flat little-endian offsets 0..4 and 4..8 with no
    /// padding between them — decoding matched the guest's real input
    /// (7, 6) exactly. Per SPEC.md §5b this parsing is display-only and not
    /// security-critical: the pairing check in verify_proof authenticates
    /// the *raw* journal bytes via journal_digest = sha256(journal)
    /// regardless of how this function interprets them.
    fn parse_journal(env: &Env, journal: &Bytes) -> (u32, u32) {
        if journal.len() < 8 {
            panic_with_error!(env, VerifierError::InvalidJournal);
        }
        let mut buf = [0u8; 4];
        journal.slice(0..4).copy_into_slice(&mut buf);
        let months_with_saving = u32::from_le_bytes(buf);
        journal.slice(4..8).copy_into_slice(&mut buf);
        let threshold_months = u32::from_le_bytes(buf);
        (months_with_saving, threshold_months)
    }
}

#[cfg(test)]
mod test;
