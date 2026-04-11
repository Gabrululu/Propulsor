# Propulsor Agent — x402 Payment Server

Express server that exposes a paid endpoint to execute the `SplitProtocol` smart contract on Stellar Testnet. Each call to `POST /execute-split` requires a **0.01 USDC** payment via the [x402](https://x402.org) protocol.

## How it works

```
Client → POST /execute-split (no payment)
       ← 402 Payment Required  { payment details }

Client pays 0.01 USDC on Stellar Testnet via x402 facilitator
Client → POST /execute-split  (X-PAYMENT header attached)
       → x402 middleware verifies payment
       → handler calls SplitProtocol::execute_split() on-chain
       ← { success, txHash, vaultBreakdown }
```

## Prerequisites

- Node.js ≥ 22
- A funded Stellar **Testnet** keypair with a USDC trustline

---

## Step 1 — Generate a Stellar Testnet keypair

1. Open **[Stellar Lab → Keypair Generator](https://lab.stellar.org/keypair-generator)**
2. Click **Generate Keypair** — copy the **Secret Key** (starts with `S`)
3. Keep the **Public Key** (starts with `G`) handy

## Step 2 — Fund the account with Testnet XLM

1. Go to **[Stellar Lab → Create Account](https://lab.stellar.org/account/create)**
2. Enter your Public Key and click **Create Account** (uses Friendbot, 10,000 XLM)

## Step 3 — Add a USDC trustline

1. Open **[Stellar Lab → Build Transaction](https://lab.stellar.org/transaction/build)**
2. Set **Source Account** to your Public Key
3. Add operation → **Change Trust**
4. Asset Code: `USDC`
5. Asset Issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` *(Testnet Circle USDC)*
6. Sign with your Secret Key and submit

## Step 4 — Get Testnet USDC

Request testnet USDC from the [Circle Testnet Faucet](https://faucet.circle.com/) using your Public Key.

---

## Installation

```bash
cd agent
npm install
```

## Configuration

```bash
cp .env.example .env
# Edit .env and set SERVER_STELLAR_SECRET to your Secret Key
```

### `.env` reference

| Variable | Default | Description |
|---|---|---|
| `SERVER_STELLAR_SECRET` | *(required)* | Server keypair secret (starts with `S`) |
| `PORT` | `3001` | HTTP port |
| `RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `FACILITATOR_URL` | `https://www.x402.org/facilitator` | x402 payment facilitator |
| `CONTRACT_ID` | `CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY` | SplitProtocol address |

---

## Step 5 — Set split rules (one-time)

Before the server can execute splits, the server's Stellar address must have rules configured on-chain. Run the setup script once:

```bash
npm run setup
```

Default rules (edit `src/setup.ts` to change):
| Vault | % |
|---|---|
| Vault 0 (Hogar) | 60% |
| Vault 1 (Ahorro) | 30% |
| Vault 2 (Inversión) | 10% |

---

## Running the server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

Server starts on `http://localhost:3001`.

---

## API

### `GET /health`

No payment required. Returns server status.

```json
{
  "ok": true,
  "serverAddress": "GABC...",
  "contractId": "CCRH...",
  "network": "stellar:testnet"
}
```

---

### `POST /execute-split`

**Protected by x402 — requires 0.01 USDC on Stellar Testnet.**

#### Request body

```json
{
  "userPublicKey": "GABC...",
  "incomeAmount": 1000000
}
```

| Field | Type | Description |
|---|---|---|
| `userPublicKey` | string | The end-user's Stellar public key (logged for audit) |
| `incomeAmount` | number | Income amount in raw units (e.g. stroops). Must be > 0 |

#### Success response

```json
{
  "success": true,
  "txHash": "abc123...",
  "vaultBreakdown": [
    { "vaultId": 0, "balance": "600000" },
    { "vaultId": 1, "balance": "300000" },
    { "vaultId": 2, "balance": "100000" }
  ],
  "meta": {
    "userPublicKey": "GABC...",
    "incomeAmount": 1000000,
    "serverAddress": "GXYZ...",
    "network": "stellar:testnet"
  }
}
```

#### Error response (500)

```json
{
  "success": false,
  "error": "Transaction failed: ..."
}
```

#### x402 Payment flow (402 response)

If no payment header is provided, the middleware returns `402 Payment Required`:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "price": "$0.01",
      "network": "stellar:testnet",
      "payTo": "GXYZ..."
    }
  ]
}
```

---

## Notes

- The server uses its **own Stellar address** as the `user` parameter when calling `execute_split`, because the contract requires `user.require_auth()`. The `userPublicKey` from the request body is included in the response metadata.
- Vault balances accumulate on-chain under the server's demo address.
- For a production integration, the client would build and sign the transaction themselves (so balances track their own address).

---

## Autonomous Monitor Agent

`src/monitor.ts` is an autonomous agent that watches a Stellar account for incoming USDC payments and automatically triggers the split contract via the x402-protected endpoint.

### How it works

```
Horizon stream → USDC payment detected on WATCHED_ACCOUNT
  → POST /execute-split (no payment)  ← 402 Payment Required
  → agent signs 0.01 USDC payment with its own keypair
  → POST /execute-split (X-PAYMENT header)
  → split executed on-chain
  → logs txHash + vault breakdown
```

### Running the monitor

**Terminal 1** — start the server:
```bash
npm run dev
```

**Terminal 2** — start the monitor:
```bash
WATCHED_ACCOUNT=G<user-public-key> npm run monitor
```

The `AGENT_SECRET` defaults to `SERVER_STELLAR_SECRET` from `.env`. To use a different keypair for paying x402 fees:
```bash
WATCHED_ACCOUNT=G<user-key> AGENT_SECRET=S<agent-secret> npm run monitor
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `WATCHED_ACCOUNT` | *(required)* | Stellar public key to watch for incoming USDC |
| `AGENT_SECRET` | `SERVER_STELLAR_SECRET` | Keypair that pays the 0.01 USDC x402 fee |
| `AGENT_SERVER_URL` | `http://localhost:3001` | URL of the running agent server |
| `VAULT2_PUBLIC_KEY` | *(optional)* | Stellar public key of the vault_2 (savings) account |
| `VAULT2_SECRET` | *(optional)* | Stellar secret key of the vault_2 account (must hold USDC) |
| `BLEND_POOL_ID` | *(see Blend setup)* | Blend lending pool contract ID on Stellar Testnet |

### Sample console output

```
──────────────────────────────────────────────────────────
  PROPULSOR AUTONOMOUS AGENT — STARTING
──────────────────────────────────────────────────────────
[2026-04-10T...] Watching account:  GBM5FC...
[2026-04-10T...] Agent address:     GBM5FC...
[2026-04-10T...] Waiting for incoming USDC payments...

──────────────────────────────────────────────────────────
  USDC PAYMENT DETECTED
──────────────────────────────────────────────────────────
[...] From:    GABC...
[...] To:      GXYZ...
[...] Amount:  10.0000000 USDC
[...] TxHash:  abc123...

──────────────────────────────────────────────────────────
  x402 PAYMENT FLOW — calling /execute-split
──────────────────────────────────────────────────────────
[...] [x402] → POST http://localhost:3001/execute-split
[...] [x402] ← 402  amount=100000  asset=USDC  payTo=GBM5...
[...] [x402] Signing payment with agent keypair GBM5FC...
[...] [x402] → Retrying with X-PAYMENT header...

──────────────────────────────────────────────────────────
  SPLIT EXECUTED SUCCESSFULLY
──────────────────────────────────────────────────────────
[...] Contract txHash:  def456...
[...] Vault Breakdown:
[...]   Vault 0: 60000000 stroops  (6.0000000 USDC)
[...]   Vault 1: 30000000 stroops  (3.0000000 USDC)
[...]   Vault 2: 10000000 stroops  (1.0000000 USDC)
```

### Auto-reconnect

If the Horizon stream disconnects, the monitor automatically reconnects after 5 seconds.

---

## Blend Protocol integration

After every successful split, the monitor automatically deposits vault_2's USDC allocation into [Blend Protocol](https://blend.capital) so it earns yield on Stellar Testnet. This is **optional and best-effort** — if the pool is unavailable or the env vars are missing, the split still completes normally and vault_2 stays in the Stellar account.

```
Horizon stream → USDC payment detected
  → split executed (vault_0: 60%, vault_1: 30%, vault_2: 10%)
  → depositToBlend(VAULT2_PUBLIC_KEY, vault_2_amount)
  → Blend pool.submit([SupplyCollateral(USDC, amount)])
  → 💰 vault_2: 1.0000000 USDC deposited to Blend → earning yield
```

### Variables to add to `.env`

```env
# ── Blend Protocol (vault_2 yield) ────────────────────────────────────────────

# Stellar account for vault_2 (savings). Must be funded + have a USDC trustline.
# Can be the same keypair as SERVER_STELLAR_SECRET for a quick demo, or a
# dedicated account for isolation (recommended).
VAULT2_PUBLIC_KEY=G...
VAULT2_SECRET=S...

# Blend lending pool contract ID on Stellar Testnet.
# How to get it: see step 2 below.
BLEND_POOL_ID=C...
```

---

### Step-by-step setup

#### Step 1 — Create a vault_2 Stellar account

vault_2 needs its own funded Stellar account with a USDC trustline. Follow the same steps as the main server account (Steps 1–4 at the top of this README) with a fresh keypair.

> **Quick shortcut for demos:** You can reuse `SERVER_STELLAR_SECRET` / its public key as `VAULT2_SECRET` / `VAULT2_PUBLIC_KEY`. The account already has XLM and USDC. The only trade-off is that vault_2 deposits come from the same address that runs the server.

---

#### Step 2 — Get the Blend pool contract ID

**Option A — Blend testnet UI (easiest)**

1. Open **[testnet.blend.capital](https://testnet.blend.capital)**
2. Connect any wallet (or browse without connecting)
3. Click on a pool that includes **USDC** (e.g. "Stellar" pool)
4. Copy the contract address from the URL or the pool info panel — it starts with `C` and is 56 characters long

**Option B — Blend GitHub deployment files**

The `blend-capital/blend-utils` repo publishes testnet deployment addresses:

```
https://github.com/blend-capital/blend-utils
  └── deployments/
        └── testnet.json   ← pool contract IDs are listed here
```

Look for a pool entry that includes the USDC reserve. The contract ID is the value under `"id"` for that pool.

**Option C — ya-otter-save reference**

The [ya-otter-save](https://github.com/briwylde08/ya-otter-save) project (one of the reference implementations for this integration) has the testnet pool ID hardcoded — check its `.env.example` or constants file.

---

#### Step 3 — Add USDC trustline for vault_2

If vault_2 is a new dedicated account, add a USDC trustline before running the monitor:

1. **[Stellar Lab → Build Transaction](https://lab.stellar.org/transaction/build)**
2. Source Account: `VAULT2_PUBLIC_KEY`
3. Add operation → **Change Trust**
4. Asset Code: `USDC` — Issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
5. Sign with `VAULT2_SECRET` and submit

Then fund it with testnet USDC from **[faucet.circle.com](https://faucet.circle.com/)**.

---

#### Step 4 — Run the monitor

```bash
npm run monitor
```

If configured correctly, the startup log will show:

```
  Blend deposit:     enabled (vault_2 = GABC1234...)
```

And after each split:

```
──────────────────────────────────────────────────────────
  BLEND DEPOSIT — vault_2 savings
──────────────────────────────────────────────────────────
[...] Depositing 1.0000000 USDC from vault_2 into Blend lending pool...
[...] 💰 vault_2: 1.0000000 USDC deposited to Blend → earning yield
[...] Blend txHash:       abc123...
[...] bTokens received:   10000000
```

If Blend is unreachable or the pool ID is wrong:

```
[...] ⚠️  Blend unavailable, vault_2 held in Stellar account
[...] (Blend simulation failed: ...)
```

The split is **not affected** — vault_2 balance stays in the Stellar account.

---

### How `blend.ts` works internally

`src/blend.ts` calls the Blend pool's `submit()` Soroban function directly using the already-installed `@stellar/stellar-sdk` — no extra dependencies needed.

```
submit(from, spender, to, requests)
  requests = [{ request_type: 0 (SupplyCollateral), address: USDC_SAC, amount }]
```

- **USDC SAC** is derived automatically via `asset.contractId(Networks.TESTNET)` — no hardcoded contract address
- Simulates → assembles footprint → signs → submits → polls for confirmation (up to 30 s)
- Returns `{ success, txHash, blendTokensReceived }`
- Throws on failure so `monitor.ts` can catch and fall back

---

## Packages used

| Package | Purpose |
|---|---|
| `@x402/express` | x402 payment middleware for Express |
| `@x402/core` | HTTPFacilitatorClient |
| `@x402/stellar` | ExactStellarScheme (Stellar payment verification) |
| `@stellar/stellar-sdk` | Soroban contract invocation |
