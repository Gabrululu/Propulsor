# Propulsor

**Your first tool for financial independence.**

The money you receive — automatically split and protected. No bank, no fees, no one else can touch it.

`FINANCIAL INDEPENDENCE · BUILT ON STELLAR · LATAM`

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Solution](#2-the-solution)
3. [How It Works](#3-how-it-works)
4. [Why Now, Why Stellar](#4-why-now-why-stellar)
5. [Market](#5-market)
6. [Business Model](#6-business-model)
7. [Competitive Landscape](#7-competitive-landscape)
8. [Current Status](#8-current-status)
9. [Go-to-Market](#9-go-to-market)
10. [Roadmap](#10-roadmap)
11. [Closing](#11-closing)
12. [Sources](#sources)

---

## 1. The Problem

- **70%** of informal workers in Latin America have no real control over their finances *(IDB, 2024)*
- **$800M+** is sent to Peru in remittances every year with no savings tools attached *(World Bank, 2024)*
- **23%** of households in the informal economy have any kind of formal savings *(INEI, 2024)*

The money arrives and disappears within days — not because of irresponsibility, but because no tool exists to protect it before social, family, or economic pressure gets to it first.

Traditional banks aren't the answer: they require a bank account and credit history, and charge fees that make no sense on small, irregular income — exactly the profile of the informal economy.

---

## 2. The Solution

> A smart contract that separates your money before the pressure arrives.

Propulsor receives your money, automatically splits it into vaults based on rules you define, and protects it — the instant it lands, with no action from you, and no bank's permission required.

---

## 3. How It Works

1. **Money arrives** — a remittance, a payment, income. USDC lands in your Stellar account.
2. **An autonomous agent detects it instantly** — watching the account 24/7, acting before any external pressure has time to intervene.
3. **It splits automatically** into named, purpose-built vaults — home, emergency fund, big goal — according to the percentages you chose.
4. **It gets protected** — every vault can be locked by date, by savings goal, or both. No one, not even you under outside pressure, can pull it out early.
5. **It earns yield on its own** — the big-goal vault's balance is deposited into Blend Protocol right after every split, earning yield from minute one.
6. **You can prove you save, without showing how much** — a zero-knowledge proof certifies "I have savings ≥ X" or "I saved consistently for the last 6 months," without revealing the real balance to anyone — not a lender, not family, not Propulsor itself.

---

## 4. Why Now, Why Stellar

- **Near-zero fees** — every operation on Stellar costs fractions of a cent, something traditional banking rails can't offer on small amounts.
- **Settlement in seconds**, not days — critical for money people need available.
- **Native USDC on Stellar** — no custodial bank, no cross-chain bridge required.
- **Soroban (smart contracts)** is now mature enough on mainnet to handle real money for real users.
- **CAP-0074** (on-chain BN254 verification, live since Protocol 25) made something possible on Stellar that didn't exist before: verifying zero-knowledge proofs directly inside a Soroban contract — the technical foundation of Propulsor's privacy layer.

---

## 5. Market

- Base: **70% of Latin America's informal workforce** has no real control over their finances *(IDB, 2024)* — the addressable market is, in essence, the region's informal economy.
- Entry point: Peru, where **$800M+ in annual remittances** arrive with no savings tool attached *(World Bank, 2024)*.
- *Still to be refined with primary market research: TAM/SAM/SOM in dollars, expected penetration rate, and LATAM fintech adoption comparables (Nubank, Ualá) in their first 24 months.*

---

## 6. Business Model

**Guiding principle:** never charge the user for saving. Never touch the principal. Never charge a flat fee — a $2 fee is invisible on $5,000 and devastating on $50, and that's exactly the user Propulsor serves.

| Layer | What it is | Who pays | Why it doesn't burden the user |
|---|---|---|---|
| **1. Core product** | Automatic splitting, vaults, date/goal locks | No one — always free | It's the trust core of the product; charging here contradicts the entire value proposition |
| **2. Shared yield** | A % of the *yield generated* on Blend Protocol (not the principal) | Only charged when there's a gain | Blend Protocol keeps 0% of the interest it generates — Propulsor's margin comes out of a gain the user wouldn't otherwise have, never out of what they already had |
| **3. B2B2C verification** | A lender, landlord, or platform pays to verify a user's proof of savings | The institution that benefits from lower risk — not the user | The user generates and shares their proof for free; whoever needs the data pays for it, not whoever owns it |
| **4. Conversion spread (later stage)** | A small, transparent margin converting local currency → USDC, via a licensed anchor | The user, minimally | Only activated once the spread is clearly lower than what traditional remittance operators already charge (5–8%+) — if it isn't a real improvement, it isn't charged |

**What Propulsor explicitly will not do:**
- Charge a monthly subscription or flat fee — regressive by design.
- Charge to withdraw or access your own money — that would punish the exact behavior the product is meant to encourage.
- Sell user data — that would contradict the product's entire reason for existing: privacy is the core promise.
- Offer high-interest loans against savings — the classic predatory pivot many "financial inclusion" fintechs make once they hold deposits; Propulsor won't take it.

---

## 7. Competitive Landscape

| Who | What they do | What's missing vs. Propulsor |
|---|---|---|
| **Nubank (Caixinhas)** | Goal-based savings sub-accounts — the closest UX analog in LATAM | **Manual** allocation (the user moves the money themselves), custodial/centralized model, no privacy layer, requires a bank account — excluding exactly the unbanked |
| **Ualá, RappiPay, and similar** | Prepaid card + personal finance management | No instant-on-arrival auto-split mechanism, no crypto rails for cross-border remittances |
| **AI agent wallets in crypto (2026)** | Agents optimizing yield/DeFi trading on delegated capital | Opposite goal: maximize return on capital already invested — not protect income the instant it lands |
| **Institutional ZK infrastructure** (proof-of-reserves, banking compliance) | Cryptographic proof of solvency, but as a B2B tool between institutions | No one has packaged it as a consumer-facing feature for an individual to prove solvency without exposing their balance |

**Propulsor's real differentiation isn't any single piece — it's the combination:** instant agent-triggered splitting + self-custodial crypto rails + on-chain verifiable privacy proof + a specific focus on the underserved informal worker. No identified player combines all four.

---

## 8. Current Status

- ✅ `SplitProtocol` and `TimeVault` contracts deployed and running on Stellar Testnet
- ✅ Autonomous agent (x402) detecting payments and executing splits with no human intervention
- ✅ Automatic yield integration with Blend Protocol
- ✅ ZK privacy layer (Groth16/BLS12-381) verifying proofs on-chain
- ✅ Second privacy layer (RISC Zero zkVM) with a deployed BN254 verifier and a real proof verified on-chain
- 🧪 Fiat on-ramp (SEP-24) implemented and tested against Stellar's reference anchor
- Validated across three competitive settings: **She Ships 2026**, **Stellar Agentic Payments Hackathon**, **Stellar Hacks — Real-World ZK**

---

## 9. Go-to-Market

- **Distribution through remittances, not cold downloads:** the moment of highest intent is when the money arrives — partnering with whoever already sends the remittance (operators, gig platforms, employers) beats competing for generic attention.
- **Community effect, not paid ads:** the product was born in a hackathon centered on women (She Ships 2026) — the first wave of users is also a natural referral network inside informal-work communities.
- **Privacy as a trust hook, not a niche feature:** "prove you save without saying how much" is a message that explains itself and resolves a real anxiety (family, informal lenders) — it doesn't require the user to understand what zero-knowledge means.
- **Ordered geographic expansion:** Peru first (where data and context are already validated), then markets with a comparable remittance and informal-economy profile across the region.

---

## 10. Roadmap

- **Short term:** move from testnet to mainnet; close a deal with a licensed SEP-24 anchor (currently using Stellar's reference anchor for testing only); first real users in Peru.
- **Mid term:** activate layer 2 of the business model (shared yield) once real deposits exist in Blend; open commercial conversations with lenders/landlords for B2B2C verification.
- **Long term:** expand to new LATAM markets; own conversion spread once a competitive licensed anchor is secured.

---

## 11. Closing

> The system wasn't built for them. Propulsor is.
>
> You don't try to save. The code protects your money — from the second it arrives.

---

## Sources

- 70% of informal workers with no real control over their finances — IDB, 2024
- $800M+ in annual remittances to Peru with no savings tools — World Bank, 2024
- 23% of informal-economy households with formal savings — INEI, 2024
- Nubank Caixinhas (manual/centralized model) — [building.nubank.com](https://building.nubank.com/how-nubank-launched-caixinhas/)
- Blend Protocol keeps 0% of generated interest — [defillama.com/protocol/blend](https://defillama.com/protocol/blend), [docs.blend.capital](https://docs.blend.capital/users/general-faq)
- CAP-0074 (on-chain BN254 verification) in Protocol 25 — [stellar-protocol/cap-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md)
