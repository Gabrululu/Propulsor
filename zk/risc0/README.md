# RISC Zero — Proof-of-Consistent-Saving

Proves a user completed splits in ≥6 distinct months out of the last 12, without revealing individual amounts. See [`ARCHITECTURE.md` → Feature 2](../../ARCHITECTURE.md#feature-2--proof-of-consistent-saving) for the product context and [`consistent_saving/SPEC.md`](./consistent_saving/SPEC.md) for the exact on-chain verification math this feature relies on.

## Requirements

- **Docker, on x86_64 Linux.** RISC Zero's Groth16 prover (the STARK-to-SNARK "wrap" step that makes the receipt small enough to verify on-chain) runs the wrapper circuit inside a Docker container. This is a RISC Zero constraint, not a Propulsor choice — there is no pure-Rust / cross-platform fallback for the Groth16 step as of `risc0-zkvm 3.0.6`. Apple Silicon / ARM hosts need Docker's x86_64 emulation (slow) or a remote x86_64 builder.
- The RISC Zero toolchain (`rzup`, `cargo-risczero`, and the `riscv32im-risc0-zkvm-elf` guest target) — install with:
  ```bash
  curl -L https://risczero.com/install | bash
  rzup install
  ```
- Proof generation takes **minutes**, not seconds — this cannot run client-side in a browser the way the BLS12-381 Proof-of-Vault flow does (that one runs entirely in WASM via snarkjs). Treat it as a backend/CLI job.

## Layout

Standard `risc0` project structure (`cargo risczero new` scaffold):

```
consistent_saving/
  Cargo.toml          — workspace (host + methods)
  host/                — reads Supabase split history, drives the prover
  methods/
    build.rs           — compiles the guest to a RISC-V ELF, embeds it (methods.rs)
    guest/              — the actual proof logic (month-counting, see SPEC.md's journal shape)
  SPEC.md              — on-chain verification spec: public-input derivation, VK constants, seal encoding
```

## Running

```bash
cd consistent_saving
SUPABASE_URL=... ZK_WEBHOOK_SECRET=... USER_ID=... cargo run --release -p host
```

`ZK_WEBHOOK_SECRET` authenticates against the `zk-fetch-user-data` Edge Function, which does the actual service_role-authenticated read — Lovable Cloud never exposes `SUPABASE_SERVICE_ROLE_KEY` outside its own Edge Functions, so the host can't hit Supabase's REST API directly (see `ARCHITECTURE.md` → "Backend secrets for Proof-of-Consistent-Saving generation").

Produces `fixture.json` (seal + journal + image ID) — used both as a `#[cfg(test)]` fixture for `ConsistentSavingVerifier` (Phase 3 of the on-chain verifier plan) and as the input to the Phase 4 submission script.
