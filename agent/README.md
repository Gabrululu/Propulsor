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
pnpm install --frozen-lockfile
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
| `INTERNAL_API_KEY` | *(required for /split)* | Random secret shared with Supabase Edge Function |
| `SUPABASE_URL` | *(optional)* | Supabase project URL — required to reach `agent-webhook` |
| `AGENT_WEBHOOK_SECRET` | *(optional)* | Shared secret with the `agent-webhook` Edge Function — enables transaction history + the dashboard's live Agent status card (`agent_status`/`agent_activity`). The agent never needs `SUPABASE_SERVICE_ROLE_KEY` directly — the Edge Function has it auto-injected. |

---

## Deploy to Railway

Railway hosts the agent server as a public HTTPS endpoint so the frontend can reach it.

### Step A — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select the `Propulsor` repo and set the **Root Directory** to `/agent`
3. Railway will detect Node.js automatically via `railway.json`

### Step B — Set environment variables in Railway

In the Railway dashboard → **Variables**, add every variable from `.env` plus:

```
INTERNAL_API_KEY=<generate a random 32-char string>
SUPABASE_URL=https://<your-project>.supabase.co
AGENT_WEBHOOK_SECRET=<generate a random 32-char string — must match the Supabase secret>
```

Note: the agent never needs `SUPABASE_SERVICE_ROLE_KEY` — it only calls the `agent-webhook` Edge Function, which does the actual writes using its own auto-injected service role key (Supabase/Lovable Cloud inject this into every Edge Function automatically; it's never obtainable or needed outside of one).

Generate a random key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Step C — Run setup on Railway

After first deploy, open **Railway → Service → Shell** and run:
```bash
pnpm run setup
```
This registers the 60/30/10 split rules on-chain under the server's address.

### Step D — Connect frontend

1. Copy the Railway service URL (e.g. `https://propulsor-agent.railway.app`)
2. Add to your Supabase Edge Function secrets:
   ```bash
   supabase secrets set AGENT_SERVER_URL=https://propulsor-agent.railway.app
   supabase secrets set INTERNAL_API_KEY=<same key as Railway>
   supabase secrets set AGENT_WEBHOOK_SECRET=<same key as Railway>
   ```
3. Deploy the Edge Functions:
   ```bash
   supabase functions deploy agent-proxy
   supabase functions deploy agent-webhook
   supabase functions deploy agent-watchlist
   ```
4. Add to your frontend `.env`:
   ```env
   VITE_AGENT_SERVER_URL=https://propulsor-agent.railway.app
   ```

### Step E — Run the monitor (required for auto-splits)

The monitor is what actually detects deposits — without it, splits never run
automatically. It can run in two ways:

**Inside the server (recommended, one Railway service).** Add to the server
service: `RUN_MONITOR=true`, `SUPABASE_URL` and `AGENT_WEBHOOK_SECRET`. The
server starts the monitor after it begins listening and the monitor calls it
over loopback with the same `INTERNAL_API_KEY`. One Node process uses about
110 MB, against about 250 MB for two. If the monitor's variables are missing,
the server logs `Monitor not started` and keeps serving.

**As a separate service:**

1. In Railway → **Add Service → GitHub Repo** (same repo)
2. Set Root Directory to `/agent`
3. Set **Custom Start Command** to `node dist/monitor.js`
4. Set **Healthcheck Path** to empty — this process has no HTTP server and
   can never answer a healthcheck; leaving one configured makes Railway
   mark every deploy as failed.
5. Add environment variables from `.env.monitor.example`: `INTERNAL_API_KEY`,
   `AGENT_SERVER_URL`, `SUPABASE_URL`, `AGENT_WEBHOOK_SECRET`. There is no
   per-account variable — the monitor discovers
   every user's account dynamically (see below).

---

## Step 5 — Set split rules (one-time)

Before the server can execute splits, the server's Stellar address must have rules configured on-chain. Run the setup script once:

```bash
pnpm run setup
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
pnpm run dev

# Production
pnpm run build && pnpm start
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

`src/monitor.ts` is an autonomous agent that watches Stellar Testnet for incoming USDC payments to **any** Propulsor user's account and automatically triggers the split contract via the x402-protected endpoint. One deployed process serves every user — it is not pinned to a single hardcoded account.

### How it works

```
Every 60s: GET agent-watchlist → refresh the set of accounts to react to
  (one Stellar public key per user who has finished wallet setup)

Horizon stream (global, no .forAccount filter)
  → USDC payment detected, payment.to is in the watchlist
  → skipped unless that user authorized the agent server in SplitProtocol
  → POST /split with the payment id (bearer INTERNAL_API_KEY)
  → server re-checks the payment on Horizon
  → split executed on-chain for that user; a payment can only be split once
  → logs txHash + vault breakdown
  → notifies `agent-webhook` with watchedAccount = payment.to
    → resolves to the right user → dashboard status card + activity feed update live
```

Watching Stellar's payment stream globally and filtering in-process (rather than opening one Horizon stream per user) is what lets a single process cover an unbounded number of users without spawning more Railway services as Propulsor grows.

The monitor also notifies `agent-webhook` for every account newly added to the watchlist (`agent_started`) and on split failures (`agent_error`), so each user's dashboard reflects whether the agent is actually watching their account — not just whether their last split succeeded.

### Running the monitor locally

**Terminal 1** — start the server:
```bash
pnpm run dev
```

**Terminal 2** — start the monitor:
```bash
pnpm run monitor
```

`INTERNAL_API_KEY` must match the agent server's. `SUPABASE_URL` and `AGENT_WEBHOOK_SECRET` are required — without them the monitor has no way to fetch the watchlist or report activity, so it exits immediately with a clear error.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `INTERNAL_API_KEY` | *(required)* | Same value as the agent server's |
| `AGENT_SERVER_URL` | `http://localhost:3001` | URL of the running agent server |
| `SUPABASE_URL` | *(required)* | Used to call `agent-watchlist` (GET) and `agent-webhook` (POST) |
| `AGENT_WEBHOOK_SECRET` | *(required)* | Shared secret with both Edge Functions above |

See `.env.monitor.example` for a ready-to-copy template with deployment steps.

### Sample console output

```
──────────────────────────────────────────────────────────
  PROPULSOR AUTONOMOUS AGENT — STARTING
──────────────────────────────────────────────────────────
[2026-04-10T...] Agent address:     GBM5FC...
[2026-04-10T...] Watching:          3 account(s) (refreshed every 60s)
[2026-04-10T...] Waiting for incoming USDC payments...

──────────────────────────────────────────────────────────
  USDC PAYMENT DETECTED
──────────────────────────────────────────────────────────
[...] From:    GABC...
[...] To:      GXYZ...
[...] Amount:  10.0000000 USDC
[...] TxHash:  abc123...

──────────────────────────────────────────────────────────
  Requesting split from the agent server
──────────────────────────────────────────────────────────

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

## Yield

The monitor doesn't deposit savings into Blend: that would need every user's key. Users deposit into Blend or DeFindex themselves from the app's Vaults page. See [ARCHITECTURE.md](../ARCHITECTURE.md#yield).

## Packages used

| Package | Purpose |
|---|---|
| `@x402/express` | x402 payment middleware for Express |
| `@x402/core` | HTTPFacilitatorClient |
| `@x402/stellar` | ExactStellarScheme (Stellar payment verification) |
| `@stellar/stellar-sdk` | Soroban contract invocation |
