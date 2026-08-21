# Propulsor 💜

> **Your first tool for financial independence.**
> The money you receive — automatically split and protected. No bank, no fees, no one else can touch it.

---

## What is Propulsor?

Propulsor is a programmable financial management platform for the informal economy across Latin America. Using smart contracts on the **Stellar (Soroban)** network, every income is automatically split into protected vaults based on user-defined rules — no bank account required, no abusive fees, with real protection against external social and financial pressures.

**The problem:** 70% of informal economy workers in Latin America lack access to formal financial products (IDB, 2024). Peru alone receives $800M+ in annual remittances — most reaches households with no formal savings tools and disappears within days. Not due to irresponsibility: due to lack of tools.

**The solution:** A smart contract that separates money before pressure arrives.

---

## Key Features

- **Programmable vaults** — income is split by user-defined percentage rules (e.g. 60% spending / 30% emergency / 10% savings) and enforced on-chain via the `SplitProtocol` Soroban contract.
- **Time & goal locks** — the `TimeVault` contract can lock a vault until a date or until it reaches a savings goal, whichever comes first.
- **Agentic payments (x402)** — an autonomous agent detects incoming remittances the instant they land on-chain and executes the split without any user action, closing the window that social/family pressure could otherwise exploit. See [Agentic Payments Layer](./ARCHITECTURE.md#agentic-payments-layer).
- **Automatic yield** — the savings vault is deposited into **Blend Protocol** right after every split, earning yield from minute one.
- **Zero-knowledge privacy layer** — users can prove savings claims (e.g. "my savings vault holds ≥ $50") **without revealing their actual balance**, using a Groth16/BLS12-381 proof verified on-chain. See [ZK Privacy Layer](./ARCHITECTURE.md#zk-privacy-layer).
- **Voice accessibility** — key flows are narrated via ElevenLabs TTS for users with low digital literacy.
- **Bilingual** — the product ships in Spanish and English (`src/lib/i18n`).

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
| Agentic Payments | x402 protocol (`@x402/stellar`, `@x402/express`) |
| Yield | Blend Protocol |
| Zero-Knowledge | Circom + Groth16 (snarkjs) · RISC Zero zkVM |
| Voice / Accessibility | ElevenLabs API (`eleven_multilingual_v2`) |
| UI Platform | Lovable |
| Fonts | Space Grotesk + Space Mono (Google Fonts) |

---

## Quick Start

### Frontend

```bash
npm install
npm run dev      # http://localhost:5173
```

Copy `.env.example` to `.env` and fill in your Supabase and Stellar values — see [Environment Variables](./ARCHITECTURE.md#environment-variables) for the full reference.

### Autonomous agent (x402 + Horizon monitor)

The agent watches a Stellar account for incoming USDC and triggers the on-chain split itself. Full setup (keypair generation, funding, trustlines, env vars) lives in [ARCHITECTURE.md → Agentic Payments Layer](./ARCHITECTURE.md#agentic-payments-layer) and [`agent/README.md`](./agent/README.md).

```bash
cd agent && npm install && npm run setup   # register split rules on-chain
npm run dev       # terminal 1 — x402-protected split server
npm run monitor   # terminal 2 — autonomous payment monitor
```

### Smart contracts

Contracts live under `contracts/` (`split_protocol`, `time_vault`) and `zk/contracts/` (`proof_of_vault_verifier`). Build/deploy steps and deployed Testnet contract IDs are in [ARCHITECTURE.md → Smart Contracts](./ARCHITECTURE.md#smart-contracts).

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — system diagrams, smart contract logic, ZK proof design, database schema, environment variables, module reference.
- **[BRANDKIT.md](./BRANDKIT.md)** — colors, typography, logo, voice & tone for decks, posts, and any Propulsor-branded material.
- **[agent/README.md](./agent/README.md)** — full environment variable reference and Blend setup for the autonomous agent.

---

## Project Status

| Module | Status |
|---|---|
| Landing page | ✅ Complete |
| Auth (Supabase) | ✅ Complete |
| Onboarding wizard | ✅ Complete |
| Dashboard, vaults, transaction history | ✅ Complete |
| Interactive simulator | ✅ Complete |
| Stellar SDK layer | ✅ Complete |
| ElevenLabs voice | ✅ Complete |
| Soroban contracts (`SplitProtocol`, `TimeVault`) | ✅ Deployed Testnet |
| x402 split server + autonomous agent | ✅ Complete |
| Blend yield integration | ✅ Complete (best-effort) |
| ZK Proof-of-Vault (Groth16/BLS12-381) | ✅ Live on Testnet |
| ZK Proof-of-Consistent-Saving (RISC Zero) | 🔜 Attestation pattern — on-chain BN254 verifier not yet built (see [note](./ARCHITECTURE.md#feature-2--proof-of-consistent-saving)) |
| SEP-24 fiat on-ramp | 🔜 Post-hackathon |
| Stellar Mainnet | 🔜 Post-hackathon |

Full details and known limitations: [ARCHITECTURE.md → Known Limitations & Future Work](./ARCHITECTURE.md#known-limitations--future-work).

---

## Hackathon Context

Propulsor was originally built for **She Ships 2026**, a 48-hour global hackathon celebrating International Women's Day (March 6–8, 2026), focused on financial tools for women in the informal economy in Latin America. Since then, the product scope has broadened to serve informal-economy workers across the region more generally, not one demographic exclusively.

It was subsequently extended for the **Stellar Agentic Payments Hackathon** with the addition of the x402-powered autonomous agent, and again for **Stellar Hacks — Real-World ZK** with the zero-knowledge privacy layer.

The architecture is testnet-grade for the demo and mainnet-ready in design.

---

## Team

Built with 💜 in Lima, Peru.

*Built on Stellar · Powered by Soroban · She Ships 2026 + Stellar Agentic Payments Hackathon + Stellar Hacks Real-World ZK 💜*
