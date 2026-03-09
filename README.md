# Propulsor 💜

> **Tu primera herramienta de independencia financiera.**  
> El dinero que recibes, separado y protegido automáticamente — sin banco, sin comisión, sin que nadie lo toque.

---

## ¿Qué es Propulsor?

Propulsor es una plataforma de gestión financiera programable para mujeres en economía informal en Latinoamérica. Usando Smart Contracts en la red **Stellar (Soroban)**, cada ingreso se divide automáticamente en tres bóvedas protegidas según reglas definidas por la usuaria — sin cuenta bancaria, sin comisiones abusivas, con protección real contra presiones externas.

**El problema:** El 70% de las mujeres en economía informal en América Latina no tiene acceso a productos financieros formales (BID, 2024). Perú recibe $800M+ en remesas anuales — la mayoría llega a manos de mujeres jefas de hogar y desaparece en días. No por irresponsabilidad: por falta de herramientas.

**La solución:** Un contrato inteligente que separa el dinero antes de que llegue la presión.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Edge Functions) |
| Blockchain | Stellar Network (Testnet / Mainnet) |
| Smart Contracts | Soroban (Rust) — deploy local |
| Stellar SDK | `@stellar/stellar-sdk` |
| Voice / Accesibilidad | ElevenLabs API (`eleven_multilingual_v2`) |
| UI Platform | Lovable |
| Fonts | Space Grotesk + Space Mono (Google Fonts) |

---

## Arquitectura

```
Usuario
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
Soroban Smart Contracts (Rust)  ← Deploy local con stellar-cli
  │  SplitProtocol::execute_split()
  │  VaultManager::lock_vault()
  │  TimeVault::release_on_condition()
  ▼
Stellar Testnet → Mainnet
```

---

## Variables de Entorno

Crear `.env` en la raíz del proyecto:

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

## Rutas de la Aplicación

| Ruta | Descripción | Auth |
|---|---|---|
| `/` | Landing page | Pública |
| `/simular` | Simulador interactivo de split | Pública |
| `/onboarding` | Wizard de 3 pasos + creación de cuenta Stellar | Post-registro |
| `/dashboard` | Overview de bóvedas y balance | Protegida |
| `/dashboard/bovadas` | Gestión de bóvedas | Protegida |
| `/dashboard/transacciones` | Historial de transacciones (local + Stellar) | Protegida |
| `/dashboard/configuracion` | Perfil, PIN, preferencias de voz | Protegida |

---

## Esquema de Base de Datos (Supabase)

```sql
-- Perfil de usuario
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

-- Bóvedas
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

-- Transacciones
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

-- Reglas de split
split_rules (
  id              uuid PRIMARY KEY,
  user_id         uuid REFERENCES users_profile,
  vault_id        uuid REFERENCES vaults,
  percentage      integer,
  updated_at      timestamptz DEFAULT now()
)
```

---

## Módulos del Frontend

### `/lib/stellar/`

```
client.ts       — SorobanRpc.Server + Horizon.Server configurados
wallet.ts       — generateKeypair, fundTestnetAccount, getAccountBalance,
                  saveEncryptedKeypair, loadDecryptedKeypair
contracts.ts    — executeSplit, lockVault, getVaultBalances
                  (simulación automática si CONTRACT_ID está vacío)
streaming.ts    — Horizon payment streaming para detección en tiempo real
fees.ts         — fetchCurrentFee, fetchXLMPrice (CoinGecko free API)
```

### `/lib/elevenlabs/`

```
useVoice.ts     — Hook: { speak, stop, isSpeaking }
                  Llama a Supabase Edge Function /functions/tts
                  Cache en memoria para textos repetidos
                  Falla silenciosamente si la API no responde
messages.ts     — buildSplitConfirmation(vaults, total)
                  buildSimulatorSummary(pen, usdc, splits)
                  Textos hardcoded del onboarding
```

### `/components/stellar/`

```
NetworkStatus.tsx    — Pill: STELLAR TESTNET · verde/amarillo/rojo
AccountCreation.tsx  — Terminal animada del onboarding (Friendbot flow)
TxHash.tsx           — Hash truncado + botón copiar + link Explorer
BalanceDisplay.tsx   — Balance USDC con polling cada 30s
```

### `/components/voice/`

```
SpeakerButton.tsx    — Icono 🔊 con pulse animation (pink)
SoundWaveBars.tsx    — 3 barras animadas mientras habla
VoiceConfirmation.tsx — Post-split audio feedback
```

---

## Smart Contracts 

> Los contratos se compilan y deployan usando Stellar

```bash
# Requisitos
rustup target add wasm32-unknown-unknown
cargo install stellar-cli --features opt

# Compilar
cd contracts/split-protocol
cargo build --target wasm32-unknown-unknown --release

# Deploy en Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/split_protocol.wasm \
  --source account \
  --network testnet

# Copiar el Contract ID resultante → VITE_SPLIT_CONTRACT_ID en .env
```

### Lógica de los contratos

**SplitProtocol** — Distribuye ingresos en porcentajes:

$$\text{vault}_i = \text{income} \times \frac{p_i}{100}, \quad \sum_{i=1}^{n} p_i = 100$$

**TimeVault** — Condición de liberación dual:

$$\text{release} = \begin{cases} \text{true} & \text{si } t \geq t_{\text{unlock}} \\ \text{true} & \text{si } \text{balance} \geq \text{goal} \\ \text{false} & \text{en otro caso} \end{cases}$$

---

## Integración ElevenLabs

La voz se usa en 3 puntos específicos para accesibilidad de usuarias con baja alfabetización digital:

| Punto | Trigger | Mensaje |
|---|---|---|
| Onboarding Step 1 | Auto-play al montar (+600ms delay) | Bienvenida personalizada por perfil |
| Post-split confirm | Auto-play al completar el contrato | Narración del desglose real de bóvedas |
| Simulador | Click en "Escuchar resumen" | Resumen dinámico según sliders actuales |

**La API key nunca llega al cliente.** Todo pasa por la Edge Function `/functions/tts`.

---

## Diseño del Sistema

```
Colores
  --bg:        #1e1a1b   Fondo principal (siempre oscuro)
  --bg-deep:   #181416   Secciones profundas
  --bg-card:   #252023   Cards
  --pink:      #ffb3c6   Acento rosa bebé — CTAs, emocional, empowerment
  --mint:      #b8f0c8   Acento verde menta — técnico, Stellar, confirmaciones
  --white:     #fdf4f6   Texto principal
  --sub:       #9a8890   Texto secundario
  --dim:       #5a4850   Texto dimmed / labels

Tipografía
  Space Grotesk 700  — Títulos, uppercase, tracking −0.03em
  Space Mono         — Labels, código, monospace UI
  Space Grotesk 400  — Body text

Reglas
  · Rosa (#ffb3c6) para elementos emocionales y CTAs
  · Menta (#b8f0c8) para elementos técnicos y estados de éxito
  · Sin gradientes en fondos — solo colores sólidos oscuros
  · Acentos solo en texto, bordes (baja opacidad) y micro-glows (≤8% opacidad)
```

---

## Estado del Proyecto

| Módulo | Estado |
|---|---|
| Landing page | ✅ Completo |
| Auth (Supabase) | ✅ Completo |
| Onboarding wizard | ✅ Completo |
| Dashboard overview | ✅ Completo |
| Gestión de bóvedas | ✅ Completo |
| Historial de transacciones | ✅ Completo |
| Simulador interactivo | ✅ Completo |
| Stellar SDK layer | ✅ Completo |
| ElevenLabs voice | ✅ Completo |
| Contratos Soroban (Rust) | 🔧 Deploy local |
| SEP-24 Anchor real | 🔜 Post-hackathon |
| Stellar Mainnet | 🔜 Post-hackathon |

---

## Contexto: She Ships Hackathon

**She Ships** es un hackathon global de 48 horas celebrando el Día Internacional de la Mujer (6–8 Marzo 2026).

---

## Equipo

Construido con 💜 en Lima, Perú — She Ships 2026.

---

*Built on Stellar · Powered by Soroban · She Ships 2026 💜*
