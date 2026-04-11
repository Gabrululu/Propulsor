# Propulsor 💜

> **Your first tool for financial independence.**  
> The money you receive — automatically split and protected. No bank, no fees, no one else can touch it.

---

## What is Propulsor?

Propulsor is a programmable financial management platform for women in the informal economy across Latin America. Using Smart Contracts on the **Stellar (Soroban)** network, every income is automatically split into three protected vaults based on user-defined rules — no bank account required, no abusive fees, with real protection against external pressures.

**The problem:** 70% of women in the informal economy in Latin America lack access to formal financial products (IDB, 2024). Peru receives $800M+ in annual remittances — most reaches women heads of household and disappears within days. Not due to irresponsibility: due to lack of tools.

**The solution:** A smart contract that separates money before pressure arrives.

---

## 🤖 Agentic Payments Layer *(Stellar Hackathon)*

Propulsor now includes a fully autonomous payments agent built on the **x402 protocol**. When a remittance arrives at any hour of the day, the agent detects it via Horizon streaming, pays its own 0.01 USDC fee to trigger the x402-protected split endpoint, and executes the on-chain distribution — all without any user interaction. The savings vault (vault_2) is then automatically deposited into **Blend Protocol** to start earning yield immediately, before social or family pressure has any chance to redirect the funds.

---

## 🏗️ Architecture *(Updated)*

```
Remittance arrives (USDC on Stellar Testnet)
         │
         ▼
  Horizon Streaming ──► Agent Monitor (monitor.ts)
                                  │
                          x402 Payment Flow
                          (agent self-pays 0.01 USDC fee)
                                  │
                                  ▼
                        POST /execute-split  (server.ts)
                                  │
                                  ▼
                      SplitProtocol Contract (Soroban)
                      ├── vault_0: spending    60%
                      ├── vault_1: emergency   30%
                      └── vault_2: savings     10%
                                                │
                                                ▼
                                     Blend Protocol (blend.ts)
                                     └── deposit → bTokens → yield
```

**Original flow** (React frontend) remains unchanged — users can still trigger splits manually and manage vaults through the UI.

---

## ⚡ Agent Setup & Running

### Prerequisites

- Node.js ≥ 22
- A funded Stellar Testnet keypair with a USDC trustline (see steps below)

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
cp .env.example .env   # or create .env manually
```

Minimum required variables:

```env
SERVER_STELLAR_SECRET=S...   # keypair from Step 1 (server + agent)
WATCHED_ACCOUNT=G...         # Stellar address to watch for USDC payments

# Optional — enables automatic Blend yield on vault_2
VAULT2_PUBLIC_KEY=G...
VAULT2_SECRET=S...
BLEND_POOL_ID=C...           # get from testnet.blend.capital
```

See [`agent/README.md`](./agent/README.md) for the full variable reference and Blend setup instructions.

### Step 5 — Install & run

```bash
cd agent
npm install

# One-time: register split rules on-chain (60/30/10)
npm run setup
```

Then in two terminals:

```bash
# Terminal 1 — x402-protected split server
npm run dev

# Terminal 2 — autonomous payment monitor
npm run monitor
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

──────────────────────────────────────────────────────────
  BLEND DEPOSIT — vault_2 savings
──────────────────────────────────────────────────────────
  💰 vault_2: 1.0000000 USDC deposited to Blend → earning yield
  Blend txHash: def456...
```

---

## 🏆 Hackathon Context

Propulsor was originally built for **She Ships 2026**, a 48-hour global hackathon celebrating International Women's Day (March 6–8, 2026), focused on financial tools for women in the informal economy in Latin America.

It was subsequently extended for the **Stellar Agentic Payments Hackathon** with the addition of the x402-powered autonomous agent. The agentic layer directly addresses the core problem: remittances arrive at unpredictable hours and the window to protect the money before external pressures redirect it can be minutes, not days. The agent closes that window to zero — the split happens the moment the payment lands on-chain, without requiring the user to be present or take any action.

The architecture is testnet-grade for the demo and mainnet-ready in design.

---

## ⚠️ Known Limitations & Future Work

| Item | Status | Notes |
|---|---|---|
| Blend deposit | Best-effort | Falls back gracefully if testnet pool is unavailable; vault_2 held in Stellar account |
| Secret key management | Simplified for demo | Production requires HSM or MPC wallet — never store raw secrets in `.env` |
| SEP-24 fiat on-ramp | Pending | Anchor integration needed for direct fiat → USDC deposit flow |
| Stellar Mainnet | Pending | Contracts and agent are mainnet-ready; keypair + anchor coordination outstanding |
| Blend withdrawal | Not implemented | Deposit-only for the demo scope; withdrawal follows the same `submit()` pattern |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Edge Functions) |
| Blockchain | Stellar Network (Testnet / Mainnet) |
| Smart Contracts | Soroban (Rust) |
| Stellar SDK | `@stellar/stellar-sdk` |
| Voice / Accessibility | ElevenLabs API (`eleven_multilingual_v2`) |
| UI Platform | Lovable |
| Fonts | Space Grotesk + Space Mono (Google Fonts) |

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
  │  VaultManager::lock_vault()
  │  TimeVault::release_on_condition()
  ▼
Stellar Testnet → Mainnet
```

---

## Environment Variables

Create `.env` in the project root:

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stellar
VITE_STELLAR_NETWORK=TESTNET
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Soroban Contract IDs 
VITE_SPLIT_CONTRACT_ID=
VITE_VAULT_CONTRACT_ID=

# ElevenLabs 
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
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
```

---

## Frontend Modules

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

## Smart Contracts 

> Contracts are compiled and deployed using Stellar CLI

```bash
# Requirements
rustup target add wasm32-unknown-unknown
cargo install stellar-cli --features opt

# Build
cd contracts/split-protocol
cargo build --target wasm32-unknown-unknown --release

# Deploy to Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/split_protocol.wasm \
  --source account \
  --network testnet

# Copy the resulting Contract ID → VITE_SPLIT_CONTRACT_ID in .env
```

### Contract Logic

**SplitProtocol** — Distributes income by percentages:

$$\text{vault}_i = \text{income} \times \frac{p_i}{100}, \quad \sum_{i=1}^{n} p_i = 100$$

**TimeVault** — Dual release condition:

$$\text{release} = \begin{cases} \text{true} & \text{if } t \geq t_{\text{unlock}} \\ \text{true} & \text{if } \text{balance} \geq \text{goal} \\ \text{false} & \text{otherwise} \end{cases}$$

---

## ElevenLabs Integration

Voice is used at 3 specific points for accessibility for users with low digital literacy:

| Point | Trigger | Message |
|---|---|---|
| Onboarding Step 1 | Auto-play on mount (+600ms delay) | Personalized welcome by profile |
| Post-split confirm | Auto-play on contract completion | Narration of actual vault breakdown |
| Simulator | Click "Listen to summary" | Dynamic summary based on current sliders |

**The API key never reaches the client.** Everything goes through the Edge Function `/functions/tts`.

---

## Design System

```
Colors
  --bg:        #1e1a1b   Main background (always dark)
  --bg-deep:   #181416   Deep sections
  --bg-card:   #252023   Cards
  --pink:      #ffb3c6   Baby pink accent — CTAs, emotional, empowerment
  --mint:      #b8f0c8   Mint green accent — technical, Stellar, confirmations
  --white:     #fdf4f6   Primary text
  --sub:       #9a8890   Secondary text
  --dim:       #5a4850   Dimmed text / labels

Typography
  Space Grotesk 700  — Headings, uppercase, tracking −0.03em
  Space Mono         — Labels, code, monospace UI
  Space Grotesk 400  — Body text

Rules
  · Pink (#ffb3c6) for emotional elements and CTAs
  · Mint (#b8f0c8) for technical elements and success states
  · No gradients on backgrounds — solid dark colors only
  · Accents only on text, borders (low opacity) and micro-glows (≤8% opacity)
```

---

## Project Status

| Module | Status |
|---|---|
| Landing page | ✅ Complete |
| Auth (Supabase) | ✅ Complete |
| Onboarding wizard | ✅ Complete |
| Dashboard overview | ✅ Complete |
| Vault management | ✅ Complete |
| Transaction history | ✅ Complete |
| Interactive simulator | ✅ Complete |
| Stellar SDK layer | ✅ Complete |
| ElevenLabs voice | ✅ Complete |
| Soroban contracts (Rust) | ✅ Deployed Testnet |
| x402 split server (`server.ts`) | ✅ Complete |
| Autonomous agent (`monitor.ts`) | ✅ Complete |
| Blend yield integration (`blend.ts`) | ✅ Complete (best-effort) |
| SEP-24 fiat on-ramp | 🔜 Post-hackathon |
| Stellar Mainnet | 🔜 Post-hackathon |

---

## 📦 Deployed Contracts (Stellar Testnet)

### Network & Infrastructure

| Item | Value |
|---|---|
| **Network** | Stellar Testnet |
| **Soroban RPC** | `https://soroban-testnet.stellar.org` |
| **Horizon** | `https://horizon-testnet.stellar.org` |
| **USDC Issuer** | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` *(Circle Testnet)* |
| **x402 Facilitator** | `https://www.x402.org/facilitator` |

### SplitProtocol

| Field | Value |
|---|---|
| **Contract ID** | `CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY` |
| **Wasm Hash** | `ea57fb45e7dd0e5865d9512b50683d22b7076f1eba36c24dffc7b09077533c1e` |
| **Deploy Tx** | [`d11b2ad6…0834ddc7`](https://stellar.expert/explorer/testnet/tx/d11b2ad60355df81a03a2a0d16c626fe016f0e1265f31d280292549b0834ddc7) |
| **Lab** | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY) |

### TimeVault

| Field | Value |
|---|---|
| **Contract ID** | `CC73UGT72A2MOZOSK6WFWMMIL32OJPJSPKEBFNBLK2GZJYNORERTSSWX` |
| **Wasm Hash** | `cf3edcf33cdbbfbe762d39de437b03d711e7d320510c7029cf593f5ae50bc72d` |
| **Deploy Tx** | [`011aaf17…3651d6ed`](https://stellar.expert/explorer/testnet/tx/011aaf17f4993bb9242a84c4d983e975d260313ebd9434a354f2b8cd3651d6ed) |
| **Lab** | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CC73UGT72A2MOZOSK6WFWMMIL32OJPJSPKEBFNBLK2GZJYNORERTSSWX) |

### Testnet Verification

```bash
# set_rules — configure 60/30/10
stellar contract invoke \
  --source-account deployer \
  --id CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY \
  --network testnet \
  -- set_rules \
  --user $(stellar keys public-key deployer) \
  --rules '[{"vault_id":0,"percentage":60},{"vault_id":1,"percentage":30},{"vault_id":2,"percentage":10}]'
# ✅ Event: rules_set — 3 rules

# execute_split — split 1,000,000,000 stroops
stellar contract invoke \
  --source-account deployer \
  --id CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY \
  --network testnet \
  -- execute_split \
  --user $(stellar keys public-key deployer) \
  --income 1000000000
# ✅ Event: split_done
# Result: [vault_0: 600M, vault_1: 300M, vault_2: 100M]
```

---

## Team

Built with 💜 in Lima, Peru.

---

*Built on Stellar · Powered by Soroban · She Ships 2026 + Stellar Agentic Payments Hackathon 💜*
