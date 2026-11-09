# Architecture

This document covers how Propulsor is built: the end-to-end flow, smart contract logic, the ZK privacy layer, the frontend module layout, the database schema, and every environment variable the project reads. For the product pitch and quick start, see [README.md](./README.md).

---

## System Overview

```
Remittance arrives (USDC on Stellar Testnet)
         │
         ▼
  Horizon Streaming ──► Agent Monitor (monitor.ts)
                                  │
                          user authorized the agent?
                                  │
                                  ▼
                        POST /split  (server.ts, re-checks the payment on Horizon)
                                  │
                                  ▼
                      SplitProtocol Contract (Soroban)
                      ├── vault_0: spending    60%
                      ├── vault_1: emergency   30%
                      └── vault_2: savings     10%

  Yield (optional, user-signed in the app): Blend pool or DeFindex vault
  — see "Yield" below
```

The **original flow** (React frontend) works independently of the agent — users can always trigger splits manually and manage vaults through the UI. The agent is an autonomous fast path layered on top.

---

## Agentic Payments Layer

When a remittance arrives at any hour of the day, the agent detects it via Horizon streaming and, if the recipient authorized the agent in `SplitProtocol`, executes the on-chain distribution through the server's internal `POST /split` — all without any user interaction. The x402-protected `POST /execute-split` stays available for outside agents, and it also only splits verified incoming payments. The savings vault (`vault_2`) is then automatically deposited into **Blend Protocol** to start earning yield immediately, before social or family pressure has any chance to redirect the funds.

Why the agent uses Horizon streaming instead of RPC: Stellar RPC is the preferred entry point for new contract-state queries, but it has no native push/streaming API for account payments (only polling via `getEvents`/`getLatestLedger`). Horizon's `server.payments().forAccount(...).stream(...)` remains the correct tool for real-time payment detection — it is legacy for historical queries, not for streaming.

### Prerequisites

- Node.js ≥ 22
- A funded Stellar Testnet keypair with a USDC trustline

### Step 1 — Generate a keypair

Open [Stellar Lab → Keypair Generator](https://lab.stellar.org/keypair-generator) and click **Generate Keypair**. Save the **Secret Key** (starts with `S`) and the **Public Key** (starts with `G`).

### Step 2 — Fund with Testnet XLM

Go to [Stellar Lab → Create Account](https://lab.stellar.org/account/create), enter your Public Key, and click **Create Account** (uses Friendbot — gives 10,000 XLM).

### Step 3 — Add a USDC trustline

1. Open [Stellar Lab → Build Transaction](https://lab.stellar.org/transaction/build)
2. Source Account: your Public Key
3. Add operation → **Change Trust**
4. Asset Code: `USDC` — Issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
5. Sign with your Secret Key and submit

Then get testnet USDC from the [Circle Testnet Faucet](https://faucet.circle.com/).

### Step 4 — Configure environment variables

```bash
cd agent
cp .env.example .env
```

Minimum required variables:

```env
SERVER_STELLAR_SECRET=S...     # keypair from Step 1 (server + agent)
SUPABASE_URL=https://...       # monitor: fetches the watchlist + reports activity
AGENT_WEBHOOK_SECRET=...       # monitor: shared secret with agent-watchlist/agent-webhook

```

The monitor watches Stellar Testnet globally and reacts to any payment sent to a known user account — it fetches that account list from Supabase (`agent-watchlist`, refreshed every 60s) rather than being pinned to one hardcoded `WATCHED_ACCOUNT`, so one deployment covers every user.

See [`agent/README.md`](./agent/README.md) for the full variable reference.

### Step 5 — Install & run

```bash
cd agent
pnpm install --frozen-lockfile
pnpm run setup     # one-time: register split rules on-chain (60/30/10)
```

Then in two terminals:

```bash
pnpm run dev       # terminal 1 — x402-protected split server
pnpm run monitor   # terminal 2 — autonomous payment monitor
```

**Expected output after a USDC payment arrives:**

```
──────────────────────────────────────────────────────────
  USDC PAYMENT DETECTED
──────────────────────────────────────────────────────────
  From:    GABC...    Amount: 10.0000000 USDC

──────────────────────────────────────────────────────────
  SPLIT EXECUTED SUCCESSFULLY
──────────────────────────────────────────────────────────
  Vault 0: 60000000 stroops  (6.0000000 USDC)
  Vault 1: 30000000 stroops  (3.0000000 USDC)
  Vault 2: 10000000 stroops  (1.0000000 USDC)
```

### Yield

The agent doesn't move savings into yield protocols: it would need every user's key, and PIN-protected keys can't be decrypted on the server. Instead, the Vaults page (`src/components/YieldPanel.tsx`, `src/lib/stellar/yield.ts`) lets the user deposit into and withdraw from either protocol, signing each move from their own account:

| Protocol | Testnet contract | Call |
|---|---|---|
| Blend pool `TestnetV2` | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` | `submit(user, user, user, [{request_type: 0 supply / 1 withdraw}])` |
| DeFindex USDC vault | `CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN` | `deposit([amount], [min], user, true)` / `withdraw(shares, [min], user)`, 1% slippage |

On testnet both use Blend's own test USDC (`USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56`), not the Circle test USDC remittances arrive in, so deposits don't change the vault accounting. Users get it from Blend's faucet through the `blend-faucet` Edge Function (the faucet only answers testnet.blend.capital's browser origin); the app checks the returned transaction can only add trustlines and receive Blend's test assets before the user signs it. DeFindex's testnet vault currently leaves deposits idle, so its balance doesn't grow there. Mainnet needs Circle USDC addresses and a deliberate choice of pool or vault (see the February 2026 YieldBlox pool incident).

---

## Smart Contracts

> Contracts are compiled and deployed using Stellar CLI.

```bash
rustup target add wasm32-unknown-unknown
cargo install stellar-cli --features opt

cd contracts/contracts/split_protocol
cargo build --target wasm32-unknown-unknown --release

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/split_protocol.wasm \
  --source account \
  --network testnet

# Copy the resulting Contract ID → SPLIT_CONTRACT_ID in src/lib/stellar/client.ts, agent/src/config.ts
# and supabase/functions/zk-fetch-user-data/index.ts, and VITE_SPLIT_CONTRACT_ID in .env.example
# (src/lib/stellar/contractIds.test.ts fails if they differ)
```

### Contract Logic

**SplitProtocol** (`contracts/contracts/split_protocol`) — distributes income by percentage rules, accumulating on top of existing vault balances. Any integer-division remainder is credited to the anchor vault so every stroop of income is fully distributed:

$$\text{vault}_i = \text{income} \times \frac{p_i}{100}, \quad \sum_{i=1}^{n} p_i = 100$$

**TimeVault** (`contracts/contracts/time_vault`) — dual release condition, whichever is met first:

$$\text{release} = \begin{cases} \text{true} & \text{if } t \geq t_{\text{unlock}} \\ \text{true} & \text{if } \text{balance} \geq \text{goal} \\ \text{false} & \text{otherwise} \end{cases}$$

Both contracts require `Address.require_auth()` on every state-changing call, use `checked_add`/`checked_mul` for balance arithmetic (with `overflow-checks = true` in the release profile), extend persistent-storage TTL on every write, and emit events on every state change.

### Deployed Contracts (Stellar Testnet)

| Item | Value |
|---|---|
| **Network** | Stellar Testnet |
| **Soroban RPC** | `https://soroban-testnet.stellar.org` |
| **Horizon** | `https://horizon-testnet.stellar.org` |
| **USDC Issuer** | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` *(Circle Testnet)* |
| **x402 Facilitator** | `https://www.x402.org/facilitator` |

**SplitProtocol**

| Field | Value |
|---|---|
| Contract ID | `CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT` |
| Lab | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT) |

Deployed 2026-11-07 with no admin: a user authorizes one agent with `authorize_agent` and removes it with `revoke_agent`. `agent_execute_split` only adds to that user's vault accounting (no USDC moves) and refuses a `payment_ref` it has already seen. `get_split_history` keeps the user's largest split per 10-day window for about a year.

**TimeVault**

| Field | Value |
|---|---|
| Contract ID | `CCOJ5A4NDHJ7ANSXVDKG63TSTXGJHWCZGCBDHF5KAGLBGFHVHJKJPMTG` |
| Lab | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CCOJ5A4NDHJ7ANSXVDKG63TSTXGJHWCZGCBDHF5KAGLBGFHVHJKJPMTG) |

### Testnet Verification

```bash
# set_rules — configure 60/30/10
stellar contract invoke \
  --source-account deployer \
  --id CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT \
  --network testnet \
  -- set_rules \
  --user $(stellar keys public-key deployer) \
  --rules '[{"vault_id":0,"percentage":60},{"vault_id":1,"percentage":30},{"vault_id":2,"percentage":10}]'
# ✅ Event: rules_set — 3 rules

# execute_split — split 1,000,000,000 stroops
stellar contract invoke \
  --source-account deployer \
  --id CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT \
  --network testnet \
  -- execute_split \
  --user $(stellar keys public-key deployer) \
  --income 1000000000
# ✅ Event: split_done
# Result: [vault_0: 600M, vault_1: 300M, vault_2: 100M]
```

---

## ZK Privacy Layer

Propulsor includes a proof system that lets users prove financial claims, built on Groth16 and verified on-chain via Soroban.

> **Privacy status:** both verifiers check claims against `SplitProtocol`, whose balances and split history are public, as is every split's amount. The proofs bind claims to an account and to real on-chain data, but they do not make balances private. Hiding them needs amounts removed from public state, which is not built.

### Feature 1 — Proof-of-Vault

Prove that the savings vault (`vault_2`) holds ≥ a threshold amount. The proof is bound to the account through a `user_binding` public input, and the verifier also reads the real balance from `SplitProtocol`, because the circuit alone can't know whether the balance it was given is true. The proof is generated entirely in the browser (client-side WASM) and verified on-chain by the `ProofOfVaultVerifier` Soroban contract (`zk/contracts/proof_of_vault_verifier`).

**Why this matters for LATAM financial inclusion:** workers in informal economies often face social or family pressure to share or redistribute their savings. A ZK proof lets them demonstrate creditworthiness or savings consistency to institutions, employers, or family members — without revealing their exact balance and without surrendering privacy.

**Tech stack:**
- Circuit: Circom 2.x + `GreaterEqThan(64)` comparator (BLS12-381 curve) — `zk/circuits/proof_of_vault`
- Proof system: Groth16 (snarkjs)
- Verifier: `ProofOfVaultVerifier` Soroban contract — pairing check `e(-A,B)·e(α,β)·e(vk_x,γ)·e(C,δ)=1`
- Frontend: snarkjs WASM runs in the browser (`src/components/ZKProofPanel.tsx`)
- Shareable proof: `/verify/{proof_hash}` — anyone can verify, no auth required (`src/pages/VerifyProof.tsx`)

**Flow:**
1. User sets a threshold (e.g. "$50 USDC")
2. Browser reads `vault_2` balance from Soroban
3. snarkjs generates a Groth16 proof off-chain (~3–5s in WASM)
4. Proof is submitted to `ProofOfVaultVerifier` on Stellar Testnet
5. Contract runs the pairing check and emits `ProofVerified(user, threshold, ledger)`
6. User gets a shareable link: `/verify/{proof_hash}`

```
Browser (ZKProofPanel.tsx)
  │  reads vault_2 balance from Soroban
  │  snarkjs WASM generates Groth16/BLS12-381 proof (~3-5s)
  │  negates A point client-side (pre-neg for pairing)
  │  encodes G2 points as IETF/blst: c1 ∥ c0 (192 bytes each)
  ▼
ProofOfVaultVerifier (Soroban — Protocol 22)
  │  requires SplitProtocol.get_balances(user) vault_2 ≥ threshold
  │  pairing_check([-A,B], [α,β], [vk_x,γ], [C,δ]) → bool
  │    vk_x = ic0 + ic1·threshold + ic2·user_binding
  │  nullifier = sha256(a∥b∥c) → replay protection
  │  stores ProofRecord { user, threshold_usdc, ledger } (180-day TTL)
  │  emits ProofVerified(user, threshold, nullifier)
  ▼
/verify/{proof_hash}  (VerifyProof.tsx — public, no auth)
  └─ reads ProofRecord from contract + ledger close time from Horizon
```

**Deployed contract (Testnet):** `ProofOfVaultVerifier` → `CCJK5UO5PGB6S223O2UY6LM6ZDDDQHQ2RQULQ72ICWR76CVJNKUF2KKE` ([Stellar Lab](https://lab.stellar.org/r/testnet/contract/CCJK5UO5PGB6S223O2UY6LM6ZDDDQHQ2RQULQ72ICWR76CVJNKUF2KKE)). Live, initialized with the circuit's verification key, ready to accept proofs.

> **⚠️ Trusted Setup Notice:** the proving key (`circuit.zkey`) comes from a single-contributor ceremony with random entropy, generated 2026-11-07. Whoever ran it could have kept the toxic waste, which is why a forged proof must still pass the verifier's balance check. A production deployment needs a multi-party ceremony or a transparent proof system.

### Feature 2 — Proof-of-Consistent-Saving

Proves a user has completed splits in ≥ 6 distinct months out of the last 12, without revealing individual amounts. Uses the RISC Zero zkVM.

- Guest: `zk/risc0/consistent_saving/methods/guest/src/main.rs` — counts qualifying calendar months in the user's on-chain split history (`SplitProtocol.get_split_history`) and commits a hash of the user and of that history. `ConsistentSavingVerifier` compares both with the chain, so the proof is recorded for the right account and can't use invented data, whoever generates or submits it. Built in Docker (`methods/build.rs`), which makes the image ID reproducible on any machine. Splits made before the 2026-11-07 deployment aren't in that history
- Host: `zk/risc0/consistent_saving/host/src/main.rs` — generates a `Groth16Receipt` (STARK wrapped to BN254 via `ProverOpts::groth16()`)
- On-chain verifier: `zk/contracts/consistent_saving_verifier` (`ConsistentSavingVerifier`, Soroban/BN254, CAP-0074) — mirrors `ProofOfVaultVerifier`'s BLS12-381 pairing-check pattern, generalized to 5 public inputs and RISC Zero's published (no-new-trusted-setup) verifying key. See `zk/risc0/consistent_saving/SPEC.md` for the full derivation.
- Status: **live on Testnet.** Phase 1 (empirical formula cross-check against a real Groth16 receipt), Phase 3 (contract logic + tests, including a real end-to-end proof accepted via Soroban's actual BN254 host functions), and Phase 4 (deploy + on-chain submission) all completed 2026-08-21.

**Deployed contract (Testnet):** `ConsistentSavingVerifier` → `CA23PPSGHDQNJ5E2ZDS3HVZ4ZO3VEMTEEKLC5C4DKZK77QOJFW2IHREE`. Live, initialized with RISC Zero's published Groth16 VK and the `consistent_saving` guest's image ID. A real proof (7/12 qualifying months, synthetic data) was submitted and accepted on-chain: txHash `cb367fecf701cd9a798835d662a711e96cc67c2ad333c36f753a0fed5c32f70d`, nullifier `42f0536fe0a87502d13058db3c717246af7b7199165efa4123d5d9b3a6f07b39` — `get_proof` confirms the stored `ProofRecord` decodes to `months_with_saving=7, threshold_months=6`, matching the guest's real input exactly.

**Frontend integration (added 2026-08-22):** `ConsistentSavingProofPanel.tsx` (Dashboard) lets a user request a proof, and `VerifyConsistentSavingProof.tsx` (`/verify-saving/:proofHash`) is the public verification page — same pattern as Feature 1's `ZKProofPanel`/`VerifyProof`, with one structural difference: **generation cannot run in the browser or on Railway.** RISC Zero's Groth16 "wrap" step shells out to Docker (`zk/risc0/README.md`), and Railway blocks Docker-in-Docker outright. So generation runs asynchronously on a GitHub Actions runner instead:

```
ConsistentSavingProofPanel → POST request-consistent-saving-proof (Edge Function)
  → inserts a `zk_proof_jobs` row (status: queued)
  → dispatches .github/workflows/generate-consistent-saving-proof.yml via the GitHub API

GitHub Actions (ubuntu-latest, has Docker)
  → cargo run --release -p host
      → GET zk-fetch-user-data (Edge Function — the runner has no service_role
        access, so this is how the host reads the user's split history)
      → RISC Zero proving (several minutes)
  → reads fixture.json's journal.passes
    → false: POST zk-proof-webhook  { status: "not_qualified" }  — never publishes a proof of NOT saving consistently
    → true:  pnpm exec tsx verify_onchain_consistent_saving.ts  → submits on-chain
             → POST zk-proof-webhook  { status: "done", proof_hash, tx_hash, ... }

zk-proof-webhook → updates the zk_proof_jobs row
  → ConsistentSavingProofPanel's Supabase realtime subscription updates live
```

See [Environment Variables → Backend secrets for Proof-of-Consistent-Saving generation](#backend-secrets-for-proof-of-consistent-saving-generation) for the full secret list this pipeline needs across Supabase and GitHub.

> **Note (checked 2026-08-21):** the code comments here used to say this is "waiting on CAP-0074 (Protocol 26)" — that was stale. [CAP-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md) (host functions for BN254: `bn254_g1_add`, `bn254_g1_mul`, `bn254_multi_pairing_check`) reached **Final** status and actually shipped in **Protocol 25 ("X-Ray")** — live on Testnet since Jan 7, 2026 and Mainnet since Jan 22, 2026. The network is on Protocol 27 as of this writing, so the host functions have been available for 7+ months. The on-chain verifier contract described above now exists.

### Generate a Proof Locally (CLI)

```bash
# 1. Compile circuit + trusted setup (requires circom ≥ 2.1 with --prime bls12381)
cd zk/circuits/proof_of_vault
make all        # compiles circuit, runs powers-of-tau, creates circuit.zkey

# 2. Copy artifacts to the public folder (served to browser by Vite)
cp build/circuit_js/circuit.wasm ../../../public/zk/circuit.wasm
cp circuit.zkey ../../../public/zk/circuit.zkey

# 3. Encode VK for the Soroban contract
cd ../../
pnpm install
pnpm exec tsx scripts/encode_vk.ts     # outputs zk/scripts/vk_encoded.json

# 4. Build + deploy the verifier contract with __constructor (Protocol 22)
cd contracts/proof_of_vault_verifier
stellar contract build
cd ../../
STELLAR_SECRET=S... pnpm exec tsx scripts/deploy_contract.ts
# → copy the contract ID to VITE_ZK_VERIFIER_CONTRACT_ID in .env
# (deploys and initializes with the VK atomically — no separate init step needed)

# 5. Generate + verify a proof via CLI (the UI does this automatically)
pnpm exec tsx scripts/generate_proof.ts --balance 1000000000 --threshold 500000000
STELLAR_SECRET=S... VERIFIER_CONTRACT_ID=C... pnpm exec tsx scripts/verify_onchain.ts
```

### Generate a Consistent-Saving Proof Locally (CLI)

```bash
# Requires Docker (RISC Zero's Groth16 STARK-to-SNARK wrapper runs in a
# container — see zk/risc0/README.md) and the RISC Zero toolchain (rzup).

# 1. Generate a real Groth16Receipt against your own Supabase split history
cd zk/risc0/consistent_saving/host
SUPABASE_URL=... SUPABASE_KEY=... USER_ID=... cargo run --release
# → writes fixture.json (seal + journal + image ID)
#
# Or, to validate the SPEC.md formulas end-to-end against synthetic data
# instead (no Supabase needed — this is Phase 1's exit criteria):
#   cargo run --release --example crosscheck_fixture

# 2. Encode RISC Zero's published VK for the Soroban contract (one-time —
#    this VK is fixed, not per-application; no new trusted setup)
cd ../../../
pnpm install --frozen-lockfile
pnpm exec tsx scripts/encode_risc0_vk.ts   # outputs zk/scripts/vk_risc0_encoded.json

# 3. Build + deploy ConsistentSavingVerifier with __constructor (Protocol 22)
cd contracts/consistent_saving_verifier
cargo build --target wasm32v1-none --release
cd ../../
STELLAR_SECRET=S... pnpm exec tsx scripts/deploy_consistent_saving_verifier.ts
# → copy the contract ID to VITE_CONSISTENT_SAVING_VERIFIER_CONTRACT_ID in .env
# (image_id defaults to fixture.json's image_id_hex — pass --image-id to override)

# 4. Submit the fixture's proof on-chain
STELLAR_SECRET=S... CONSISTENT_SAVING_VERIFIER_CONTRACT_ID=C... \
  pnpm exec tsx scripts/verify_onchain_consistent_saving.ts
```

---

## Frontend Architecture

```
User
  │
  ▼
React Frontend (Lovable)
  │  Supabase Auth + PostgreSQL
  │  /lib/stellar/client.ts      ← Stellar SDK layer
  │  /lib/stellar/wallet.ts      ← Keypair management
  │  /lib/stellar/contracts.ts   ← Soroban contract calls
  │  /lib/elevenlabs/voice.ts    ← ElevenLabs TTS hook
  ▼
Supabase Edge Functions
  │  /functions/tts              ← ElevenLabs proxy (API key server-side)
  │  /functions/stellar-sign     ← Tx signing helper
  ▼
Stellar Horizon API             ← Balance, tx history, fee stats
Stellar Soroban RPC             ← Contract execution
  ▼
Soroban Smart Contracts (Rust)  ← Deployed via stellar-cli
  │  SplitProtocol::execute_split()
  │  TimeVault::lock_vault()
  ▼
Stellar Testnet → Mainnet
```

### `/lib/stellar/`

```
client.ts       — SorobanRpc.Server + Horizon.Server configuration
wallet.ts       — generateKeypair, fundTestnetAccount, getAccountBalance,
                  saveEncryptedKeypair, loadDecryptedKeypair
contracts.ts    — executeSplit, lockVault, getVaultBalances
                  (auto-simulation when CONTRACT_ID is empty)
streaming.ts    — Horizon payment streaming for real-time detection
fees.ts         — fetchCurrentFee, fetchXLMPrice (CoinGecko free API)
```

### `/lib/elevenlabs/`

```
useVoice.ts     — Hook: { speak, stop, isSpeaking }
                  Calls Supabase Edge Function /functions/tts
                  In-memory cache for repeated texts
                  Fails silently if the API is unresponsive
messages.ts     — buildSplitConfirmation(vaults, total)
                  buildSimulatorSummary(pen, usdc, splits)
                  Hardcoded onboarding texts
```

Voice is used at 3 specific points for accessibility for users with low digital literacy:

| Point | Trigger | Message |
|---|---|---|
| Onboarding Step 1 | Auto-play on mount (+600ms delay) | Personalized welcome by profile |
| Post-split confirm | Auto-play on contract completion | Narration of actual vault breakdown |
| Simulator | Click "Listen to summary" | Dynamic summary based on current sliders |

**The API key never reaches the client.** Everything goes through the Edge Function `/functions/tts`.

### `/components/stellar/`

```
NetworkStatus.tsx    — Pill: STELLAR TESTNET · green/yellow/red
AccountCreation.tsx  — Animated terminal for onboarding (Friendbot flow)
TxHash.tsx           — Truncated hash + copy button + Explorer link
BalanceDisplay.tsx   — USDC balance with 30s polling
```

### `/components/voice/`

```
SpeakerButton.tsx    — 🔊 icon with pulse animation (pink)
SoundWaveBars.tsx    — 3 animated bars while speaking
VoiceConfirmation.tsx — Post-split audio feedback
```

---

## Application Routes

| Route | Description | Auth |
|---|---|---|
| `/` | Landing page | Public |
| `/simular` | Interactive split simulator | Public |
| `/onboarding` | 3-step wizard + Stellar account creation | Post-signup |
| `/dashboard` | Vaults & balance overview | Protected |
| `/dashboard/bovadas` | Vault management | Protected |
| `/dashboard/transacciones` | Transaction history (local + Stellar) | Protected |
| `/dashboard/configuracion` | Profile, PIN, voice preferences | Protected |
| `/verify/:proofHash` | Public ZK proof verification (Proof-of-Vault) | Public |
| `/verify-saving/:proofHash` | Public ZK proof verification (Proof-of-Consistent-Saving) | Public |

---

## Environment Variables

This is for the **frontend** (root `.env`) — not to be confused with `agent/.env`, covered in [Agentic Payments Layer → Step 4](#step-4--configure-environment-variables). Every `VITE_`-prefixed value here is baked into the browser bundle at build time and is publicly readable — never put real secrets behind a `VITE_` name.

Create `.env` in the project root:

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# Stellar
VITE_STELLAR_NETWORK=TESTNET
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Soroban Contract IDs. Only scripts/check-stellar.mjs reads these: the app uses
# the constants in src/lib/stellar/client.ts
VITE_SPLIT_CONTRACT_ID=CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT
VITE_VAULT_CONTRACT_ID=CCOJ5A4NDHJ7ANSXVDKG63TSTXGJHWCZGCBDHF5KAGLBGFHVHJKJPMTG
VITE_ZK_VERIFIER_CONTRACT_ID=CCJK5UO5PGB6S223O2UY6LM6ZDDDQHQ2RQULQ72ICWR76CVJNKUF2KKE
VITE_CONSISTENT_SAVING_VERIFIER_CONTRACT_ID=CA23PPSGHDQNJ5E2ZDS3HVZ4ZO3VEMTEEKLC5C4DKZK77QOJFW2IHREE

# Autonomous agent server URL (Railway)
VITE_AGENT_SERVER_URL=https://propulsor-production.up.railway.app
```

### Other backend secrets

| Where | Secret | Purpose |
|---|---|---|
| Supabase (`wallet-key` function) | `WALLET_KEY_SECRET` | Derives the passphrase that encrypts social-login keys. Changing it makes existing social keys unreadable |
| Railway (server and monitor) | `INTERNAL_API_KEY` | Same value in both. The monitor uses it to call the server's `POST /split` |

### Contract administration

All four contracts have one admin, set at deployment, whose only power is `upgrade(new_wasm_hash)`: replacing a contract's code while keeping its address and data. On mainnet this key should be a multisig. `.github/workflows/release-contracts.yml` builds a contract with a SEP-55 attestation when a tag like `split_protocol-v1` is pushed. The currently deployed WASMs were built locally, not through it.

### Backend secrets for Proof-of-Consistent-Saving generation

Generation runs on GitHub Actions, not Railway or Supabase (see [Feature 2](#feature-2--proof-of-consistent-saving) for why). Required, beyond the `VITE_` vars above:

Lovable Cloud never exposes `SUPABASE_SERVICE_ROLE_KEY` outside its own Edge Functions — it can't be extracted into a GitHub Actions secret. So the RISC Zero host doesn't call the Supabase REST API directly; it reads through `zk-fetch-user-data` (an Edge Function, service_role on the inside, `ZK_WEBHOOK_SECRET`-authenticated on the outside) — the same pattern the Railway agent already uses for `agent-webhook`/`agent-watchlist`.

| Where | Secret | Purpose |
|---|---|---|
| Supabase (`request-consistent-saving-proof` function) | `GITHUB_TOKEN` | PAT with `actions:write` on this repo — dispatches the workflow |
| Supabase (same function) | `GITHUB_REPO` | `owner/repo`, e.g. `Gabrululu/Propulsor` |
| Supabase (`zk-proof-webhook` and `zk-fetch-user-data` functions) | `ZK_WEBHOOK_SECRET` | Shared secret both functions and the GitHub Actions job authenticate with — separate from `AGENT_WEBHOOK_SECRET` so revoking one doesn't affect the other integration |
| GitHub Actions repo secrets | `SUPABASE_URL` | Public project URL — used to reach `zk-fetch-user-data` and `zk-proof-webhook` |
| GitHub Actions repo secrets | `ZK_WEBHOOK_SECRET` | Must match the Supabase one above |
| GitHub Actions repo secrets | `ZK_SUBMITTER_STELLAR_SECRET` | Funded Testnet keypair that submits the proof on-chain (can reuse `SERVER_STELLAR_SECRET`) |

Note there's no `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions at all — it never leaves Supabase.

---

## Database Schema (Supabase)

```sql
-- User profile
users_profile (
  id              uuid PRIMARY KEY REFERENCES auth.users,
  name            text,
  profile_type    enum('jefa_hogar','emprendedora','trabajadora','freelancer'),
  stellar_public_key    text,
  stellar_secret_encrypted text,
  stellar_funded  boolean DEFAULT false,
  onboarding_complete boolean DEFAULT false,
  voice_enabled   boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
)

-- Vaults
vaults (
  id              uuid PRIMARY KEY,
  user_id         uuid REFERENCES users_profile,
  name            text,
  icon            text,
  vault_type      enum('disponible','time_lock','meta'),
  percentage      integer,
  balance_usdc    numeric DEFAULT 0,
  unlock_date     timestamptz,
  goal_amount     numeric,
  color_variant   enum('pink','mint','soft'),
  stellar_account_id text,
  created_at      timestamptz DEFAULT now()
)

-- Transactions
transactions (
  id              uuid PRIMARY KEY,
  user_id         uuid REFERENCES users_profile,
  vault_id        uuid REFERENCES vaults,
  type            enum('deposit','withdrawal','split','lock'),
  amount_usdc     numeric,
  amount_pen      numeric,
  stellar_tx_hash text,
  status          enum('confirmed','pending','simulated'),
  description     text,
  created_at      timestamptz DEFAULT now()
)

-- Split rules
split_rules (
  id              uuid PRIMARY KEY,
  user_id         uuid REFERENCES users_profile,
  vault_id        uuid REFERENCES vaults,
  percentage      integer,
  updated_at      timestamptz DEFAULT now()
)

-- Proof-of-Consistent-Saving generation jobs (async — see Feature 2 below)
zk_proof_jobs (
  id                 uuid PRIMARY KEY,
  user_id            uuid REFERENCES users_profile,
  proof_type         text DEFAULT 'consistent_saving',
  status             enum('queued','done','not_qualified','error'),
  months_with_saving integer,
  threshold_months   integer,
  proof_hash         text,
  tx_hash            text,
  error_message      text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
)
```

---

## Known Limitations & Future Work

| Item | Status | Notes |
|---|---|---|
| Yield | Testnet, user-signed | Blend or DeFindex with Blend's test USDC, separate from remittance USDC (see [Yield](#yield)) |
| Secret key management | Simplified for demo | Production requires HSM or MPC wallet — never store raw secrets in `.env` |
| SEP-24 fiat on-ramp | Client implemented, testnet-verified | `src/lib/stellar/sep24.ts` (SEP-1/10/24) + `useSep24Deposit` + `Sep24DepositModal` (in `WalletDisplay`). Tested end-to-end against Stellar's reference anchor (`testanchor.stellar.org`, shares Propulsor's USDC issuer). A **licensed** anchor for real fiat is a business/KYC decision, not a code change — swap `SEP24_HOME_DOMAIN` once one is chosen |
| Stellar Mainnet | Pending | Contracts and agent are mainnet-ready; keypair + anchor coordination outstanding |
| ZK trusted setup | Dev-only ceremony | See [Trusted Setup Notice](#feature-1--proof-of-vault) above |
| Per-user on-chain identity | **Pending decision — not started** | `execute_split` always runs with the server's own address as `user` (`agent/src/server.ts` → `runSplit`), so every user's vault balances are pooled under one demo address on-chain; only the off-chain bookkeeping (`agent_activity`/`agent_status`/`transactions` in Supabase) is correctly split per user today. Giving each user their own on-chain identity while keeping the agent fully autonomous (no live user signature per split) requires Soroban's Protocol 27 delegated-auth feature (CAP-0071 `delegate_account_auth`), but that only works if the user's account is a Soroban **contract** account — Propulsor's users are classic Ed25519 G-accounts. The CAP that would add a delegated signer to an existing G-account without migrating it (CAP-0072) is still an unaccepted **Draft with no protocol version assigned** — not usable. So today this would mean migrating every user from a G-account to a custom account contract and writing its `__check_auth` logic ourselves (CAP-0071 provides no built-in per-function/per-amount scoping or expiration — that's on us to implement), plus possibly wrapping the agent itself in a minimal contract account since delegates must implement `__check_auth` (unconfirmed — needs a testnet spike). A pre-signed-authorization-entry approach (no migration needed) was also considered and rejected: Soroban auth payloads commit to the exact call arguments, so one signed entry only covers one specific deposit amount, not future deposits of unknown size. Revisit when CAP-0072 ships, or if this needs to hold real money instead of testnet funds. |
