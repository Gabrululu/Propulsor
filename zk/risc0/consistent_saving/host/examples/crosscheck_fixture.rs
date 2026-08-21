// crosscheck_fixture — Phase 1 empirical validation (see ../../SPEC.md)
//
// Generates a REAL Groth16Receipt (synthetic guest input, no Supabase needed)
// and independently re-verifies it using a from-scratch reimplementation of
// SPEC.md's formulas (tagged_struct / ReceiptClaim digest / split_digest),
// built on plain ark-bn254/ark-groth16 — deliberately NOT calling into
// risc0-groth16's own verifier internals, so a passing check here is real
// evidence the SPEC.md transcription is correct, not circular validation.
//
// This is the Rust harness the ARCHITECTURE.md on-chain-verifier plan's
// Phase 1 calls for. Also writes fixture.json for Phase 3's contract tests
// and Phase 4's submission script.
//
// Requires Docker (see ../../README.md).
//
// Usage: cargo run --release --example crosscheck_fixture

use ark_bn254::{Bn254, Fr, G1Affine, G2Affine};
use ark_ff::PrimeField;
use ark_groth16::{Groth16, PreparedVerifyingKey, Proof, VerifyingKey};
use methods::{CONSISTENT_SAVING_ELF, CONSISTENT_SAVING_ID};
use risc0_circuit_recursion::control_id::{ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde::Serialize;
use sha2::{Digest as _, Sha256};

#[derive(Serialize)]
struct SplitRecord {
    timestamp: u64,
    amount_usdc: u64,
}

#[derive(Serialize)]
struct Fixture {
    seal_hex: String,
    journal_hex: String,
    image_id_hex: String,
    crosscheck_passed: bool,
}

// ---------------------------------------------------------------------------
// SPEC.md §3 reimplementation — plain SHA-256, no risc0 trait machinery.
// ---------------------------------------------------------------------------

fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// SPEC.md §3d: tagged_struct(tag, down: &[Digest], data: &[u32]) -> Digest
fn tagged_struct(tag: &str, down: &[[u8; 32]], data: &[u32]) -> [u8; 32] {
    let tag_digest = sha256(tag.as_bytes());
    let mut buf = Vec::with_capacity(32 * (down.len() + 1) + 4 * data.len() + 2);
    buf.extend_from_slice(&tag_digest);
    for d in down {
        buf.extend_from_slice(d);
    }
    for w in data {
        buf.extend_from_slice(&w.to_le_bytes());
    }
    let down_count: u16 = down.len().try_into().unwrap();
    buf.extend_from_slice(&down_count.to_le_bytes());
    sha256(&buf)
}

const ZERO_DIGEST: [u8; 32] = [0u8; 32];

/// SPEC.md §3c/§3d: claim_digest for a ReceiptClaim::ok(image_id, journal) —
/// i.e. our guest, which always halts normally with no assumptions/input.
fn claim_digest(image_id: [u8; 32], journal: &[u8]) -> [u8; 32] {
    let journal_digest = sha256(journal);
    let output_digest = tagged_struct("risc0.Output", &[journal_digest, ZERO_DIGEST], &[]);
    let system_state_digest = tagged_struct("risc0.SystemState", &[ZERO_DIGEST], &[0]);
    tagged_struct(
        "risc0.ReceiptClaim",
        &[ZERO_DIGEST, image_id, system_state_digest, output_digest],
        &[0, 0], // ExitCode::Halted(0).into_pair()
    )
}

/// SPEC.md §3b: split_digest — the two internal .reverse() calls cancel out
/// algebraically, so this reduces to: interpret each 16-byte half of the
/// digest's native as_bytes() directly as a little-endian field element.
fn split_digest(d: [u8; 32]) -> (Fr, Fr) {
    let a0 = Fr::from_le_bytes_mod_order(&d[0..16]);
    let a1 = Fr::from_le_bytes_mod_order(&d[16..32]);
    (a0, a1)
}

// ---------------------------------------------------------------------------
// SPEC.md §2 — RISC Zero's published Groth16 VK, decimal constants copied
// verbatim from risc0/groth16/src/verifier.rs (see SPEC.md for citation).
// ---------------------------------------------------------------------------

fn fp(dec: &str) -> ark_bn254::Fq {
    use std::str::FromStr;
    ark_bn254::Fq::from_str(dec).unwrap()
}

fn g1(x: &str, y: &str) -> G1Affine {
    G1Affine::new(fp(x), fp(y))
}

fn g2(x1: &str, x2: &str, y1: &str, y2: &str) -> G2Affine {
    // ark-bn254 Fp2 field order is (c0, c1); SPEC.md §2 confirms X2/Y2 = c0, X1/Y1 = c1
    // for risc0's named constants (via risc0-groth16's own g2_from_bytes).
    let x = ark_bn254::Fq2::new(fp(x2), fp(x1));
    let y = ark_bn254::Fq2::new(fp(y2), fp(y1));
    G2Affine::new(x, y)
}

fn risc0_verifying_key() -> VerifyingKey<Bn254> {
    VerifyingKey {
        alpha_g1: g1(
            "20491192805390485299153009773594534940189261866228447918068658471970481763042",
            "9383485363053290200918347156157836566562967994039712273449902621266178545958",
        ),
        beta_g2: g2(
            "4252822878758300859123897981450591353533073413197771768651442665752259397132",
            "6375614351688725206403948262868962793625744043794305715222011528459656738731",
            "21847035105528745403288232691147584728191162732299865338377159692350059136679",
            "10505242626370262277552901082094356697409835680220590971873171140371331206856",
        ),
        gamma_g2: g2(
            "11559732032986387107991004021392285783925812861821192530917403151452391805634",
            "10857046999023057135944570762232829481370756359578518086990519993285655852781",
            "4082367875863433681332203403145435568316851327593401208105741076214120093531",
            "8495653923123431417604973247489272438418190587263600148770280649306958101930",
        ),
        delta_g2: g2(
            "1668323501672964604911431804142266013250380587483576094566949227275849579036",
            "12043754404802191763554326994664886008979042643626290185762540825416902247219",
            "7710631539206257456743780535472368339139328733484942210876916214502466455394",
            "13740680757317479711909903993315946540841369848973133181051452051592786724563",
        ),
        gamma_abc_g1: vec![
            g1(
                "8446592859352799428420270221449902464741693648963397251242447530457567083492",
                "1064796367193003797175961162477173481551615790032213185848276823815288302804",
            ),
            g1(
                "3179835575189816632597428042194253779818690147323192973511715175294048485951",
                "20895841676865356752879376687052266198216014795822152491318012491767775979074",
            ),
            g1(
                "5332723250224941161709478398807683311971555792614491788690328996478511465287",
                "21199491073419440416471372042641226693637837098357067793586556692319371762571",
            ),
            g1(
                "12457994489566736295787256452575216703923664299075106359829199968023158780583",
                "19706766271952591897761291684837117091856807401404423804318744964752784280790",
            ),
            g1(
                "19617808913178163826953378459323299110911217259216006187355745713323154132237",
                "21663537384585072695701846972542344484111393047775983928357046779215877070466",
            ),
            g1(
                "6834578911681792552110317589222010969491336870276623105249474534788043166867",
                "15060583660288623605191393599883223885678013570733629274538391874953353488393",
            ),
        ],
    }
}

// ---------------------------------------------------------------------------
// Seal parsing — SPEC.md §4: raw 256 bytes = a(64) || b(128) || c(64),
// big-endian, no reordering needed (confirmed via Seal::decode + g2_from_bytes).
// ---------------------------------------------------------------------------

fn g1_from_be(bytes: &[u8]) -> G1Affine {
    G1Affine::new(
        ark_bn254::Fq::from_be_bytes_mod_order(&bytes[0..32]),
        ark_bn254::Fq::from_be_bytes_mod_order(&bytes[32..64]),
    )
}

fn g2_from_be(bytes: &[u8]) -> G2Affine {
    // bytes = X_c1(32) || X_c0(32) || Y_c1(32) || Y_c0(32) per SPEC.md §2/§4
    let x_c1 = ark_bn254::Fq::from_be_bytes_mod_order(&bytes[0..32]);
    let x_c0 = ark_bn254::Fq::from_be_bytes_mod_order(&bytes[32..64]);
    let y_c1 = ark_bn254::Fq::from_be_bytes_mod_order(&bytes[64..96]);
    let y_c0 = ark_bn254::Fq::from_be_bytes_mod_order(&bytes[96..128]);
    G2Affine::new(ark_bn254::Fq2::new(x_c0, x_c1), ark_bn254::Fq2::new(y_c0, y_c1))
}

fn main() {
    // ── 1. Produce a real Groth16Receipt (synthetic input, no Supabase) ────
    // 7 distinct qualifying months out of 12 → passes = true (threshold 6).
    let mut splits = Vec::new();
    for month in 1..=7u64 {
        let ts = 1_700_000_000u64 + month * 30 * 86_400; // rough month spacing
        splits.push(SplitRecord { timestamp: ts, amount_usdc: 5_0000000 }); // $5
    }
    let min_amount_usdc: u64 = 1_0000000; // $1
    let threshold_months: u32 = 6;

    let env = ExecutorEnv::builder()
        .write(&splits).unwrap()
        .write(&min_amount_usdc).unwrap()
        .write(&threshold_months).unwrap()
        .build()
        .unwrap();

    println!("→ Proving (Docker required for Groth16 wrap, this takes several minutes)...");
    let prover = default_prover();
    let prove_info = prover
        .prove_with_opts(env, CONSISTENT_SAVING_ELF, &ProverOpts::groth16())
        .expect("proving failed");
    let receipt = prove_info.receipt;

    receipt.verify(CONSISTENT_SAVING_ID).expect("risc0's own receipt.verify() failed");
    println!("✓ receipt.verify() (risc0's own verifier) passed");

    let groth16 = receipt.inner.groth16().expect("not a Groth16Receipt");
    let seal = &groth16.seal;
    let journal = &receipt.journal.bytes;
    assert_eq!(seal.len(), 256, "unexpected seal length");

    // image_id: CONSISTENT_SAVING_ID is [u32;8], native LE words — same layout
    // risc0_zkp::core::digest::Digest stores internally (as_bytes() reads the
    // words as LE bytes in order).
    let mut image_id = [0u8; 32];
    for (i, w) in CONSISTENT_SAVING_ID.iter().enumerate() {
        image_id[i * 4..i * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }

    // ── 2. From-scratch reimplementation of SPEC.md §3 ──────────────────────
    let root_bytes: [u8; 32] = ALLOWED_CONTROL_ROOT.as_bytes().try_into().unwrap();
    let id_bytes: [u8; 32] = BN254_IDENTITY_CONTROL_ID.as_bytes().try_into().unwrap();

    let (root_a0, root_a1) = split_digest(root_bytes);
    let id_bn254_fr = Fr::from_le_bytes_mod_order(&id_bytes);

    let claim = claim_digest(image_id, journal);
    let (c0, c1) = split_digest(claim);

    let public_inputs = vec![root_a0, root_a1, c0, c1, id_bn254_fr];

    println!("  ALLOWED_CONTROL_ROOT split: a0={root_a0} a1={root_a1}");
    println!("  BN254_IDENTITY_CONTROL_ID as Fr: {id_bn254_fr}");
    println!("  claim_digest split: c0={c0} c1={c1}");

    // ── 3. Parse the real seal per SPEC.md §4 and run ark-groth16 directly ──
    let a = g1_from_be(&seal[0..64]);
    let b = g2_from_be(&seal[64..192]);
    let c = g1_from_be(&seal[192..256]);
    let proof = Proof::<Bn254> { a, b, c };

    let vk = risc0_verifying_key();
    let pvk: PreparedVerifyingKey<Bn254> = ark_groth16::prepare_verifying_key(&vk);
    let prepared_inputs = Groth16::<Bn254>::prepare_inputs(&pvk, &public_inputs)
        .expect("prepare_inputs failed — public input count mismatch?");

    let crosscheck_passed =
        Groth16::<Bn254>::verify_proof_with_prepared_inputs(&pvk, &proof, &prepared_inputs)
            .unwrap_or(false);

    println!(
        "\n{} independent ark-groth16 verification using SPEC.md's reimplemented formulas",
        if crosscheck_passed { "✓ PASSED —" } else { "✗ FAILED —" }
    );

    let fixture = Fixture {
        seal_hex: hex::encode(seal),
        journal_hex: hex::encode(journal),
        image_id_hex: hex::encode(image_id),
        crosscheck_passed,
    };
    std::fs::write("fixture.json", serde_json::to_string_pretty(&fixture).unwrap())
        .expect("write fixture.json failed");
    println!("✓ fixture.json written");

    assert!(crosscheck_passed, "SPEC.md reimplementation does NOT match a real receipt — do not proceed to Phase 3 with unverified formulas");
}
