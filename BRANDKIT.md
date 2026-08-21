# Propulsor Brand Kit

A reference for anyone building decks, social posts, one-pagers, or any other Propulsor-branded material. Every value here is pulled directly from the live product (`src/index.css`, `tailwind.config.ts`, `index.html`) — copy it as-is rather than eyeballing colors from a screenshot.

---

## Brand Essence

**Propulsor** — *your first tool for financial independence.*

The brand voice sits at the intersection of two things that don't usually share a room: the warmth of a personal-finance tool built for someone's abuela or first paycheck, and the precision of a fintech protocol built on smart contracts. That tension is intentional — it shows up directly in the two-color system below (pink = emotional/empowerment, mint = technical/protocol).

One-line pitch: *the money you receive — automatically split and protected. No bank, no fees, no one else can touch it.*

---

## Logo

The mark is three bars of ascending/descending height (the three vaults) sitting on a mint arc (the "circuit bowl" — money flowing in and being caught).

- Source: `public/favicon.svg` (mark only, 64×64, on `#1e1a1b` rounded background)
- Social/OG image: `public/propulsor.png`
- Bars are always pink (`#ffb3c6`), the arc is always mint (`#b8f0c8`), background is always the dark base (`#1e1a1b`)
- Minimum clear space: leave at least one bar-width of empty margin on every side
- Never place the mark on a light background, never recolor the bars, never separate the arc from the bars

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="#1e1a1b" rx="10"/>
  <rect x="9"  y="30" width="11" height="22" fill="#ffb3c6" rx="2"/>
  <rect x="26" y="16" width="12" height="36" fill="#ffb3c6" rx="2"/>
  <rect x="44" y="22" width="11" height="30" fill="#ffb3c6" rx="2"/>
  <path d="M7 54 Q32 46 57 54" stroke="#b8f0c8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>
```

The wordmark "Propulsor" is always set in **Space Grotesk 700**, uppercase or sentence case per context, never a different typeface.

---

## Color Palette

The UI is **always dark** — there is no light theme. Every surface, text, and accent color below is the actual token used in production.

| Swatch | Name | Hex | HSL | Usage |
|---|---|---|---|---|
| 🟪 | Background | `#1e1a1b` | `hsl(348 10% 11%)` | Main app background |
| ⬛ | Background Deep | `#181416` | `hsl(340 12% 8%)` | Deep sections, terminal panels |
| ▪️ | Background Card | `#252023` | `hsl(340 8% 14%)` | Cards, panels |
| ▪️ | Background Hover | `#2e2729` | `hsl(340 7% 17%)` | Hover states |
| 🩷 | **Pink** (primary/accent) | `#ffb3c6` | `hsl(345 100% 80%)` | CTAs, headline accents, emotional/empowerment elements |
| 🩷 | Pink Soft | `#e8a0b4` | — | Secondary pink accent, hover variant |
| 🟢 | **Mint** (secondary) | `#b8f0c8` | `hsl(145 65% 80%)` | Technical elements, Stellar/protocol mentions, success states |
| ⬜ | Foreground (primary text) | `#fdf4f6` | `hsl(340 50% 97%)` | Headlines, body copy on dark |
| ▫️ | Foreground Muted (sub text) | `#9a8890` | `hsl(330 8% 56%)` | Secondary copy, captions |
| ▫️ | Foreground Dimmed | `#5a4850` | `hsl(330 10% 33%)` | Labels, disabled/tertiary text |
| 🔴 | Destructive | — | `hsl(0 84% 60%)` | Errors only |

**Rules:**
- Pink is for emotional elements and CTAs. Mint is for technical elements and success/confirmation states. Don't swap them.
- No gradients on backgrounds — solid dark colors only.
- Accents apply to text, borders, and glows — never as large fill areas. Border tints stay at ~9–25% opacity (`rgba(255,179,198,0.09–0.25)`), glow shadows at ≤8% opacity (`rgba(255,179,198,0.06)` / `rgba(184,240,200,0.06)`).

**Quick-copy CSS variables** (for a Figma tokens plugin, a slide-deck theme, or any code-based tool):

```css
--bg: #1e1a1b;
--bg-deep: #181416;
--bg-card: #252023;
--pink: #ffb3c6;
--pink-soft: #e8a0b4;
--mint: #b8f0c8;
--white: #fdf4f6;
--sub: #9a8890;
--dim: #5a4850;
```

---

## Typography

| Role | Font | Weight | Treatment |
|---|---|---|---|
| Headings (h1–h6) | **Space Grotesk** | 700 | Uppercase, letter-spacing `-0.03em` |
| Body copy | **Space Grotesk** | 400 | Sentence case |
| Labels, stats, code, "eyebrow" tags | **Space Mono** | 400 / 700 | Uppercase, wide letter-spacing (`tracking-widest`) |

Both are Google Fonts, loaded together:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

For a deck or post built outside the codebase, use this fallback stack: `"Space Grotesk", "Helvetica Neue", sans-serif` for headings/body and `"Space Mono", "Courier New", monospace` for labels.

**Hero-style headline treatment:** the last word of a headline is frequently rendered as an *outline-only* character (transparent fill, 1.5px pink stroke) instead of solid color — a signature Propulsor move for a title's final beat:

```css
.text-outline {
  -webkit-text-stroke: 1.5px #ffb3c6;
  color: transparent;
}
```

---

## Voice & Tone

Propulsor writes for someone who may not be digitally fluent, in a language that never talks down to them. Copy is:

- **Direct and declarative** — short sentences, no jargon, no hedging.
- **Empowering, not paternalistic** — "your money, your rules," never "we'll take care of it for you."
- **Bilingual** — every surface ships in Spanish and English (`src/lib/i18n/translations.ts`). Spanish is the primary voice (LATAM audience); English mirrors the same tone, not a stiffer corporate register.

**Reference copy (hero, ES / EN):**

| | Spanish | English |
|---|---|---|
| Eyebrow | `INDEPENDENCIA FINANCIERA · STELLAR NETWORK · X402 · LATAM` | `FINANCIAL INDEPENDENCE · STELLAR NETWORK · X402 · LATAM` |
| Headline | `TU PRIMERA` / `HERRAMIENTA DE` / `INDEPENDENCIA.` | `YOUR FIRST` / `TOOL FOR` / `INDEPENDENCE.` |

The eyebrow pattern — short mono-uppercase tags separated by `·`, ending in the audience/geography — is reusable for any slide or post kicker.

---

## Signature UI Motifs

Use these to make any external material (deck, social card, one-pager) instantly read as Propulsor:

- **Eyebrow labels** — `font-mono text-xs uppercase tracking-widest`, muted color, sits above every section headline.
- **Outline headline word** — see Typography above; use sparingly, once per composition.
- **Glow blobs** — large soft radial gradients at ≤8% opacity, pink top-right / mint bottom-left, never sharp-edged.
- **Grid overlay** — a faint 60×60px pink grid (`rgba(255,179,198,0.04)`) behind hero-style sections.
- **Diamond pattern** — small rotated-square outlines (pink + mint, ~4% opacity) as background texture, never as a dominant element.
- **Mono stat numbers** — key metrics set in Space Mono bold, pink or mint, with a muted mono label underneath (e.g. `$0.00001` / `avg. tx fee`).
- **Pill status badges** — small rounded-full tags with a colored dot (green/yellow/red) for live-status indicators (e.g. "STELLAR TESTNET").
- **Buttons** — solid pink fill for primary CTAs (`btn-pink`, dark text, uppercase, wide tracking), transparent with pink outline for secondary (`btn-outline-pink`). No other button styles.

---

## Do / Don't

**Do**
- Keep every background dark (`#1e1a1b` or deeper) — there is no light-mode Propulsor.
- Use pink for the emotional/CTA layer and mint for the technical/protocol layer.
- Keep headline type uppercase, tight tracking, Space Grotesk 700.
- Leave generous negative space; accents stay thin (borders, glows, single outline words).

**Don't**
- Don't put the logo mark on a light or colored background.
- Don't use gradients as a fill — gradients only exist as very low-opacity glows.
- Don't mix in another typeface for headings or labels.
- Don't use pink and mint interchangeably — each carries a specific meaning (emotional vs. technical).
- Don't stretch, rotate, or recolor the three-bar mark.
