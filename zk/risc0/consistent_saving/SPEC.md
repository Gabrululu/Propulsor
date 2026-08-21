# ConsistentSavingVerifier — on-chain verification spec

This is the Phase 1 deliverable from `ARCHITECTURE.md`'s ZK Proof-of-Consistent-Saving plan: the exact, byte-precise algorithm `ConsistentSavingVerifier` (the Soroban contract, Phase 3) must implement to verify a RISC Zero `Groth16Receipt` over BN254 using CAP-0074's `bn254_g1_add` / `bn254_g1_mul` / `bn254_multi_pairing_check` host functions.

Everything below is derived directly from `risc0-zkvm`, `risc0-groth16`, and `risc0-binfmt` source (pinned at `risc0-zkvm = "=3.0.6"`), **not** guessed or reconstructed from memory. Every formula cites the exact source file. Treat this file as the spec of truth for the contract's doc comments — if a future `risc0-zkvm` version changes any of this (a new proving-system release, a new circuit version), re-derive from source again; do not assume it's stable across versions except where noted.

**Phase 1 empirical cross-check: PASSED (2026-08-21).** `host/examples/crosscheck_fixture.rs` generated a real `Groth16Receipt` (synthetic 7-month input), confirmed `receipt.verify()` (risc0's own verifier) passed, then independently re-derived every public input and re-ran the pairing check using a from-scratch `ark-groth16` reimplementation of this spec's formulas — deliberately not calling into `risc0-groth16`'s verifier internals, so a pass here is real evidence the transcription below is correct, not circular validation. Output: `✓ receipt.verify() (risc0's own verifier) passed` then `✓ PASSED — independent ark-groth16 verification using SPEC.md's reimplemented formulas`. Fixture saved to `fixture.json` (`seal_hex`, `journal_hex`, `image_id_hex`) for Phase 3's contract tests. The formula below is now confirmed against real bytes, not just transcribed from source.

---

## 1. Groth16 verification equation (curve-agnostic)

Same equation `zk/contracts/proof_of_vault_verifier` already implements for BLS12-381:

```
e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
where vk_x = IC[0] + Σ IC[i+1] · public_input[i]   for i in 0..5   (5 public inputs, 6 IC points)
```

Only the curve (BN254 instead of BLS12-381) and the input count (5 instead of 1) differ.

## 2. Verifying key — fixed, published, no new trusted setup

Source: `risc0/groth16/src/verifier.rs` (`risc0/risc0` repo, `main` branch, retrieved 2026-08-21). Comment in source: *"Constants from: risc0-ethereum/contracts/src/groth16/Groth16Verifier.sol. When running a new ceremony, update them by running `cargo xtask bootstrap-groth16`."* — i.e. this VK is the same one Ethereum's on-chain RISC Zero verifier uses; it is **not per-application**, so Propulsor does not run its own ceremony (unlike Proof-of-Vault's Circom circuit).

All values are decimal BN254 field elements (Fp coordinates), big-endian when serialized to the 32-byte-per-limb CAP-0074 G1/G2 format:

```
alpha_g1 = (ALPHA_X, ALPHA_Y)
  = (20491192805390485299153009773594534940189261866228447918068658471970481763042,
     9383485363053290200918347156157836566562967994039712273449902621266178545958)

beta_g2  = ((BETA_X1, BETA_X2), (BETA_Y1, BETA_Y2))
  = ((4252822878758300859123897981450591353533073413197771768651442665752259397132,
      6375614351688725206403948262868962793625744043794305715222011528459656738731),
     (21847035105528745403288232691147584728191162732299865338377159692350059136679,
      10505242626370262277552901082094356697409835680220590971873171140371331206856))

gamma_g2 = ((GAMMA_X1, GAMMA_X2), (GAMMA_Y1, GAMMA_Y2))
  = ((11559732032986387107991004021392285783925812861821192530917403151452391805634,
      10857046999023057135944570762232829481370756359578518086990519993285655852781),
     (4082367875863433681332203403145435568316851327593401208105741076214120093531,
      8495653923123431417604973247489272438418190587263600148770280649306958101930))

delta_g2 = ((DELTA_X1, DELTA_X2), (DELTA_Y1, DELTA_Y2))
  = ((1668323501672964604911431804142266013250380587483576094566949227275849579036,
      12043754404802191763554326994664886008979042643626290185762540825416902247219),
     (7710631539206257456743780535472368339139328733484942210876916214502466455394,
      13740680757317479711909903993315946540841369848973133181051452051592786724563))

IC[0] = (8446592859352799428420270221449902464741693648963397251242447530457567083492,
         1064796367193003797175961162477173481551615790032213185848276823815288302804)
IC[1] = (3179835575189816632597428042194253779818690147323192973511715175294048485951,
         20895841676865356752879376687052266198216014795822152491318012491767775979074)
IC[2] = (5332723250224941161709478398807683311971555792614491788690328996478511465287,
         21199491073419440416471372042641226693637837098357067793586556692319371762571)
IC[3] = (12457994489566736295787256452575216703923664299075106359829199968023158780583,
         19706766271952591897761291684837117091856807401404423804318744964752784280790)
IC[4] = (19617808913178163826953378459323299110911217259216006187355745713323154132237,
         21663537384585072695701846972542344484111393047775983928357046779215877070466)
IC[5] = (6834578911681792552110317589222010969491336870276623105249474534788043166867,
         15060583660288623605191393599883223885678013570733629274538391874953353488393)
```

**Resolved (2026-08-21), confirmed from two independent primary sources — no reordering needed:**

- CAP-0074's own spec text (`stellar/stellar-protocol`, `core/cap-0074.md`): *"`fp2` ... Encoding rule: concatenation of the two encoded-components `c1` and `c0` i.e. `be_encode(c1) || be_encode(c0)`"* and *"`G2` ... `be_encode(X_c1) || be_encode(X_c0) || be_encode(Y_c1) || be_encode(Y_c0)`"* — i.e. Soroban wants c1 before c0.
- `risc0-groth16`'s own `g2_from_bytes` (`risc0/groth16/src/lib.rs`): given inputs named `(X1, X2, Y1, Y2)` (exactly the constant names in §2 above), it builds the ark-bn254 `G2Affine` from bytes `rev(X2) ‖ rev(X1) ‖ rev(Y2) ‖ rev(Y1)`. Since `ark-serialize`'s canonical LE encoding reads a `Fp2`'s fields in declaration order `(c0, c1)`, this means **`X2 = c0`, `X1 = c1`** (and same for Y) in risc0's own convention.

Substituting: CAP-0074 wants `be(X_c1) ‖ be(X_c0) ‖ be(Y_c1) ‖ be(Y_c0)` = `be(X1) ‖ be(X2) ‖ be(Y1) ‖ be(Y2)` — **exactly the order the constants are already named and printed in §2.** So: convert each named constant to 32-byte big-endian and concatenate in printed order — `ALPHA_X ‖ ALPHA_Y` for G1 (64 bytes), `BETA_X1 ‖ BETA_X2 ‖ BETA_Y1 ‖ BETA_Y2` for G2 (128 bytes), etc. No swap, unlike the BLS12-381 `encode_vk.ts`'s `g2ToHex`, which does need to swap snarkjs's `[c0, c1]` array order for the IETF/blst convention `ProofOfVaultVerifier` expects — the two curves' scripts happen to differ here, which is exactly why this needed checking per-curve rather than assuming.

## 3. Public inputs — 5 field elements, not the raw journal

Source: `risc0/groth16/src/verifier.rs`, `Verifier::new`:

```rust
let (a0, a1) = split_digest(control_root)?;
let (c0, c1) = split_digest(claim_digest)?;
bn254_control_id.as_mut_bytes().reverse();
let id_bn254_fr = fr_from_hex_string(&hex::encode(bn254_control_id))?;
// public_inputs = [a0, a1, c0, c1, id_bn254_fr]
```

### 3a. Fixed constants (same for every proof from this risc0-zkvm version)

Source: `risc0/circuit/recursion/src/control_id.rs`:

```
ALLOWED_CONTROL_ROOT       = 517f405d5dbda85b2dc15f3ab6f8a05170bde64980ef594a8e9fd923febe1a03
BN254_IDENTITY_CONTROL_ID  = c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404
```

These are `control_root` and `bn254_control_id` in `Groth16ReceiptVerifierParameters::default()` (`risc0/zkvm/src/receipt/groth16.rs`) — the parameter set our host's `receipt.verify()` call uses implicitly. **Precompute `(a0, a1)` and `id_bn254_fr` once and bake them into the Soroban contract as constants** (parallel to how `ALLOWED_CONTROL_ROOT` never changes per-proof) — only `(c0, c1)` (derived from the claim, i.e. from the caller-supplied journal) varies per call.

Both hex strings are confirmed 64 hex chars = 32 bytes (a valid `Digest`) — do not hand-derive `(a0, a1)` / `id_bn254_fr` from these hex strings by manually guessing `Digest::as_bytes()`'s internal byte order (`split_digest`'s own code labels its *reversed* copy of `as_bytes()` as "big_endian", implying `as_bytes()` itself is not already big-endian — exactly the kind of detail that's cheap to get backward by hand and expensive to debug later). Instead, **compute `(a0, a1, id_bn254_fr)` by calling the real `risc0-groth16`/`risc0-circuit-recursion` code directly** (a small throwaway `cargo run --example` that imports `ALLOWED_CONTROL_ROOT`/`BN254_IDENTITY_CONTROL_ID` and prints the values `Verifier::new` would compute) and hardcode the printed hex, rather than reimplementing `split_digest` from this doc's description alone.

### 3b. `split_digest` — turns one 32-byte Digest into two Fr scalars

Source: `risc0/groth16/src/verifier.rs`:

```rust
fn split_digest(d: Digest) -> (Fr, Fr) {
    let big_endian = d.as_bytes().reversed();       // Digest's native bytes, reversed
    let (first16, last16) = big_endian.split_at(16); // first16 = high half, last16 = low half
    (fr_from_bytes(last16), fr_from_bytes(first16))   // returns (low, high) — mind the order
}
fn fr_from_bytes(half: &[u8]) -> Fr {
    let le = half.reversed();                         // back to little-endian
    ark_bn254::Fr::deserialize_uncompressed(le)        // zero-extended 128-bit → 254-bit scalar
}
```

So for digest `d`: `a0 = Fr(low 128 bits of d, as big-endian-then-reversed)`, `a1 = Fr(high 128 bits)`. Both `control_root` and `claim_digest` are split this way.

### 3c. `claim_digest` — depends on (image ID, journal bytes)

This is the one value that's different per proof, and the one the Soroban contract must reconstruct from what the caller submits (`image_id` baked into the contract at deploy time via `__constructor`, `journal` bytes passed as a call argument).

Source: `risc0/zkvm/src/claim/receipt.rs` (`ReceiptClaim::ok`, used for any guest that halts normally via `env::commit` — our `consistent_saving` guest does exactly this) + `risc0/binfmt/src/hash.rs` (`tagged_struct`) + `risc0/binfmt/src/sys_state.rs` (`SystemState::digest`) + `risc0/binfmt/src/exit_code.rs` (`ExitCode::into_pair`):

```
tagged_struct(tag: &str, down: &[Digest], data: &[u32]) -> Digest =
    SHA256(
        SHA256(tag.as_bytes())                     // 32 bytes
        ++ down[0] ++ down[1] ++ ...                // 32 bytes each, in order
        ++ data[0].to_le_bytes() ++ data[1]...       // 4 bytes each, little-endian
        ++ (down.len() as u16).to_le_bytes()         // 2 bytes, little-endian — appended LAST
    )

journal_digest      = SHA256(journal_bytes)                      // plain hash, no domain tag
output_digest       = tagged_struct("risc0.Output", [journal_digest, ZERO_DIGEST], [])
                        // ZERO_DIGEST = assumptions digest; our guest has no assumptions
system_state_digest = tagged_struct("risc0.SystemState", [ZERO_DIGEST], [0])
                        // pc=0, merkle_root=ZERO — fixed for ReceiptClaim::ok's `post` field
input_digest         = ZERO_DIGEST                                // our guest takes no public Input

claim_digest = tagged_struct(
    "risc0.ReceiptClaim",
    down = [input_digest, image_id, system_state_digest, output_digest],
    data = [0, 0]   // (sys_exit, user_exit) for ExitCode::Halted(0) — Halted(0).into_pair() == (0, 0)
)
```

`image_id` here is `CONSISTENT_SAVING_ID` (the `[u32; 8]` constant `methods/src/lib.rs` generates at build time from the guest ELF) — used directly as the 32-byte digest (`ReceiptClaim.pre` is `MaybePruned::Pruned(image_id)`, and a pruned `MaybePruned<T>`'s digest is just the digest value itself: `risc0/zkvm/src/claim/maybe_pruned.rs`).

**All of `ZERO_DIGEST`, `system_state_digest`, and `output_digest`'s SHA256/tag-hash mechanics reuse plain SHA256** — the same primitive `zk/contracts/proof_of_vault_verifier` already calls via `env.crypto().sha256()` for its nullifier. No new hash primitive is needed in the contract.

### 3d. Contract-side reconstruction, end to end

Given `image_id: BytesN<32>` (constructor constant) and `journal: Bytes` (call argument):

1. `journal_digest = sha256(journal)`
2. `output_digest = tagged_struct("risc0.Output", [journal_digest, ZERO], [])`
3. `system_state_digest = tagged_struct("risc0.SystemState", [ZERO], [0])` — this is itself a fixed constant, precompute once
4. `claim_digest = tagged_struct("risc0.ReceiptClaim", [ZERO, image_id, system_state_digest, output_digest], [0, 0])`
5. `(c0, c1) = split_digest(claim_digest)`
6. `public_inputs = [a0_const, a1_const, c0, c1, id_bn254_fr_const]` (the first, second, and fifth are the Phase-2-baked constants from §3a)
7. `vk_x = IC[0] + IC[1]·a0 + IC[2]·a1 + IC[3]·c0 + IC[4]·c1 + IC[5]·id_bn254_fr`
8. Pairing check: `bn254_multi_pairing_check([-seal.a, seal.b, α, vk_x, seal.c], [β wait — see §1 term order], ...)` — build this the same 4-term shape `proof_of_vault_verifier::verify_proof` already uses, generalized to a 5-scalar `vk_x` accumulation instead of 1.

## 4. Seal (proof) encoding — good news, no reordering needed

Source: `risc0/groth16/src/types.rs` (`Seal`):

```
Seal::SIZE = 256 bytes = a(64) ++ b(128) ++ c(64), all big-endian, doc comment: "Groth16 seal object encoded in big endian."
```

This is **already** CAP-0074's exact G1 (64-byte X‖Y) / G2 (128-byte, 4×32) big-endian layout — confirmed the same way as §2's VK ordering: `Seal::decode` reads the raw 256 bytes positionally into `b = [[b0,b1],[b2,b3]]` (32 bytes each), and `g2_from_bytes(seal.b)` (§2's reasoning applied again) treats `b1`/`b3` as `c0` and `b0`/`b2` as `c1` — i.e. the raw byte order `[b0,b1,b2,b3]` is already `[X_c1, X_c0, Y_c1, Y_c0]`, exactly CAP-0074's `G2` encoding rule. So the raw `Groth16Receipt.seal` bytes from `receipt.inner.groth16()?.seal` (dumped by `host/src/main.rs` as `seal_hex` in `fixture.json`) slice directly, no reordering: `a = seal[0..64]`, `b = seal[64..192]`, `c = seal[192..256]`. Unlike the BLS12-381 Proof-of-Vault case, where `encode_vk.ts`'s `g2ToHex` does need a c1/c0 swap for snarkjs's ordering — the two curves' tooling happen to disagree here, which is exactly why each needed checking independently rather than assumed-consistent.

Confirmed against the real `fixture.json` end-to-end (Phase 1 exit criteria, 2026-08-21) — `g2_from_be` sliced directly off `seal[64..192]` with no reordering, and the resulting proof verified against real pairing-check math.

## 5. Summary of what's fixed vs. per-proof

| Value | Fixed (bake into contract) | Per-proof (call argument) |
|---|---|---|
| VK (α, β, γ, δ, IC[0..6]) | ✅ §2 | |
| `(a0, a1)` from `ALLOWED_CONTROL_ROOT` | ✅ §3a | |
| `id_bn254_fr` from `BN254_IDENTITY_CONTROL_ID` | ✅ §3a | |
| `system_state_digest` | ✅ §3d step 3 | |
| `image_id` | ✅ (constructor arg, fixed per-deployment) | |
| `journal` bytes | | ✅ |
| `(c0, c1)` (derived from journal) | | ✅ (computed in-contract) |
| `seal` (a, b, c) | | ✅ |

## 5b. Journal field parsing is NOT security-critical

`ConsistentSavingVerifier` also reads `months_with_saving` / `threshold_months` out of the journal bytes to store in `ProofRecord` for the UI. The guest serializes its `Journal` struct via `risc0_zkvm::serde` (`risc0/zkvm/src/serde/`), a custom word-oriented format — **not** a flat struct-field byte layout, so the contract's current placeholder parsing (`parse_journal` in `consistent_saving_verifier/src/lib.rs`) is almost certainly wrong and needs its own derivation from `risc0_zkvm::serde::serializer.rs` before it's trusted for display.

This is explicitly a lower-priority gap than §3's public-input derivation: the cryptographic guarantee — that this journal was genuinely produced by the `consistent_saving` guest — comes entirely from `journal_digest = sha256(journal)` feeding into the pairing check over the *raw, whole* journal bytes (§3c), which does not require understanding the journal's internal structure at all. A wrong `parse_journal` produces wrong *display* numbers on an otherwise-correctly-verified proof; it cannot make an invalid proof verify. Fix before shipping the UI, not before trusting `verify_proof`'s pass/fail result.

## 6. Soroban SDK API notes (for Phase 3's implementation)

`env.crypto().bn254()` requires **`soroban-sdk >= 25.0.0`** — confirmed via `stellar/rs-soroban-sdk` tags: the `crypto::bn254` module first ships in the `v25.0.0` release line (matching Protocol 25). `zk/contracts/proof_of_vault_verifier` and `contracts/` stay on `soroban-sdk 22.x` since they don't need it; `consistent_saving_verifier` pins `=27.0.6` (current stable, matching the live Protocol 27 network) independently.

API surface actually used (method names differ slightly from CAP-0074's host-function names):
- `Bn254G1Affine::from_bytes(BytesN<64>)`, `Bn254G2Affine::from_bytes(BytesN<128>)`, `Bn254Fr::from_bytes(BytesN<32>)` — all big-endian, matching CAP-0074 §"Field and groups" and confirmed again independently by the SDK's own doc comments on `Bn254G1Affine`/`Bn254G2Affine` (a *third*, independent confirmation of the c1‖c0 G2 ordering already cross-checked in §2/§4).
- `Bn254::g1_add`, `Bn254::g1_mul`, `Bn254::g1_msm` (multi-scalar-mul — used for `vk_x`'s 5-term sum in one call instead of a manual loop), `Bn254::pairing_check(Vec<Bn254G1Affine>, Vec<Bn254G2Affine>) -> bool` (**not** `multi_pairing_check`, despite CAP-0074's XDR-level function being named that).
- **No `g1_neg` host function.** `proof_of_vault_verifier` gets around this for BLS12-381 by having the *client* pre-negate `A` before submitting the proof. RISC Zero's seal format has no such pre-negation (it's a generic Groth16 seal, not built with Soroban in mind), so `ConsistentSavingVerifier` negates `A` on-chain instead: `(x, y) -> (x, p - y)` via big-endian field subtraction, `p` = the BN254 base field modulus (`0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47`, same constant `rs-soroban-sdk`'s own `bn254.rs` hardcodes as `BN254_FP_MODULUS_BE`).

## Sources

- `risc0/groth16/src/verifier.rs` — https://github.com/risc0/risc0/blob/main/risc0/groth16/src/verifier.rs
- `risc0/groth16/src/types.rs` — https://github.com/risc0/risc0/blob/main/risc0/groth16/src/types.rs
- `risc0/circuit/recursion/src/control_id.rs` — https://github.com/risc0/risc0/blob/main/risc0/circuit/recursion/src/control_id.rs
- `risc0/zkvm/src/receipt/groth16.rs` — https://github.com/risc0/risc0/blob/main/risc0/zkvm/src/receipt/groth16.rs
- `risc0/zkvm/src/claim/receipt.rs` — https://github.com/risc0/risc0/blob/main/risc0/zkvm/src/claim/receipt.rs
- `risc0/zkvm/src/claim/maybe_pruned.rs` — https://github.com/risc0/risc0/blob/main/risc0/zkvm/src/claim/maybe_pruned.rs
- `risc0/binfmt/src/hash.rs` — https://github.com/risc0/risc0/blob/main/risc0/binfmt/src/hash.rs
- `risc0/binfmt/src/sys_state.rs` — https://github.com/risc0/risc0/blob/main/risc0/binfmt/src/sys_state.rs
- `risc0/binfmt/src/exit_code.rs` — https://github.com/risc0/risc0/blob/main/risc0/binfmt/src/exit_code.rs
- `risc0/zkvm/src/host/client/prove/opts.rs` — https://github.com/risc0/risc0/blob/main/risc0/zkvm/src/host/client/prove/opts.rs
- `soroban-sdk/src/crypto/bn254.rs` (`stellar/rs-soroban-sdk`, tag `v27.0.6`) — https://github.com/stellar/rs-soroban-sdk/blob/main/soroban-sdk/src/crypto/bn254.rs
- `core/cap-0074.md` (`stellar/stellar-protocol`) — https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md

All retrieved from the `main` branch of `risc0/risc0` on 2026-08-21, pinned in this project against `risc0-zkvm = "3.0.6"`. Re-verify against the pinned tag/release (not `main`) if `main` has since diverged.
