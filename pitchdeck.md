# Propulsor — Pitch Deck

> Este documento tiene dos capas: (1) una nota corta explicando **por qué esa diapositiva es necesaria** en cualquier pitch deck, y (2) el **contenido real, listo para usar**, escrito para Propulsor específicamente. Cuando lo pases a slides (Figma, Pitch, Google Slides), cada `##` es una diapositiva — el bloque de nota se queda en tus apuntes de presentador, no en la slide.
>
> Tono: directo, declarativo, sin paternalismo — igual que la voz de marca del producto (ver `BRANDKIT.md`). Colores: fondo oscuro `#1e1a1b`, rosa `#ffb3c6` para lo emocional/CTA, menta `#b8f0c8` para lo técnico. Tipografía: Space Grotesk (títulos/cuerpo), Space Mono (labels, stats, "eyebrows").

---

## 0. Portada

**Por qué es necesaria:** es lo único que ve alguien en los primeros 3 segundos. Si no comunica qué hace la empresa y para quién, perdiste la mitad de la atención de la sala antes de la diapositiva 2.

**Contenido:**

> **PROPULSOR**
> *Tu primera herramienta de independencia financiera.*
>
> El dinero que recibes — separado y protegido automáticamente. Sin banco, sin comisiones abusivas, sin que nadie más lo pueda tocar.
>
> `INDEPENDENCIA FINANCIERA · CONSTRUIDO EN STELLAR · LATAM`

---

## 1. El problema

**Por qué es necesaria:** antes de mostrar la solución, el inversor necesita sentir que el problema es real, grande y urgente — no algo que te inventaste para justificar el producto. Los números hacen ese trabajo.

**Contenido:**

- **70%** de los trabajadores informales en Latinoamérica no tienen control real sobre sus finanzas *(BID, 2024)*
- **$800M+** en remesas se envían a Perú cada año sin ninguna herramienta de ahorro asociada *(Banco Mundial, 2024)*
- **23%** de los hogares en la economía informal tienen algún tipo de ahorro formal *(INEI, 2024)*

El dinero llega y desaparece en días — no por irresponsabilidad, sino porque no existe una herramienta que lo proteja antes de que llegue la presión social, familiar o económica.

Los bancos tradicionales no son la respuesta: piden cuenta bancaria, historial crediticio, y cobran comisiones que no tienen sentido sobre ingresos pequeños e irregulares — exactamente el perfil de la economía informal.

---

## 2. La solución

**Por qué es necesaria:** un inversor necesita poder repetir tu solución en una frase, a otra persona, sin tu ayuda. Si necesita un párrafo, está mal escrita.

**Contenido:**

> Un contrato inteligente que separa tu dinero antes de que llegue la presión.

Propulsor recibe tu dinero, lo separa automáticamente en bóvedas según reglas que vos definís, y lo protege — todo en el instante en que llega, sin que tengas que hacer nada, sin pedir permiso a un banco.

---

## 3. Cómo funciona

**Por qué es necesaria:** demuestra que la solución no es una promesa — ya existe, funciona, y el mecanismo es concreto y verificable. Es la diapositiva que convierte escepticismo en curiosidad técnica.

**Contenido (flujo, cada paso es un beat de la demo):**

1. **Llega la plata** — una remesa, un pago, un cobro. USDC a tu cuenta en Stellar.
2. **Un agente autónomo lo detecta al instante** — vigila la cuenta 24/7 y actúa antes de que cualquier presión externa tenga tiempo de intervenir.
3. **Se separa automáticamente** en bóvedas con nombre y propósito — hogar, fondo de emergencia, meta grande — según los porcentajes que vos elegiste.
4. **Se protege** — cada bóveda se puede bloquear por fecha, por meta de ahorro, o ambas. Nadie, ni vos con presión externa, puede sacarla antes.
5. **Genera rendimiento solo** — el dinero de la bóveda de meta grande se deposita automáticamente en Blend Protocol y empieza a generar rendimiento desde el minuto uno.
6. **Podés demostrar que ahorrás, sin mostrar cuánto** — una prueba criptográfica (zero-knowledge) certifica "tengo ahorrado ≥ X" o "ahorré consistentemente los últimos 6 meses", sin revelar el balance real a nadie: ni a un prestamista, ni a la familia, ni a Propulsor mismo.

---

## 4. Por qué ahora, por qué Stellar

**Por qué es necesaria:** todo inversor de infraestructura cripto pregunta "¿por qué esta red y no otra, por qué ahora y no hace 3 años?". Si no tenés una respuesta de una frase, asumen que no pensaste la arquitectura.

**Contenido:**

- **Comisiones casi cero** — cada operación en Stellar cuesta fracciones de centavo, algo imposible de ofrecer sobre montos pequeños con rieles bancarios tradicionales.
- **Liquidación en segundos**, no días — crítico para dinero que la gente necesita disponible.
- **USDC nativo en Stellar** — no hace falta un banco custodio ni un puente entre cadenas.
- **Soroban (contratos inteligentes)** ya está en mainnet y es lo suficientemente maduro para manejar dinero real de usuarios reales.
- **CAP-0074** (verificación BN254 on-chain, activa desde Protocolo 25) hizo posible algo que antes no existía en Stellar: verificar pruebas de conocimiento cero directamente en un contrato Soroban — la base técnica de la capa de privacidad de Propulsor.

---

## 5. Mercado

**Por qué es necesaria:** el inversor necesita saber si esto puede llegar a ser grande. Acá hay que ser honesta si todavía no tenés un TAM/SAM/SOM validado con investigación primaria — es mejor mostrar los números reales que tenés y ser clara sobre lo que falta, que inventar una cifra de mercado que no podés defender en la siguiente pregunta.

**Contenido:**

- Base: **70% de la fuerza laboral informal en Latinoamérica** no tiene control real sobre sus finanzas *(BID, 2024)* — el mercado direccionable es, en esencia, la economía informal de toda la región.
- Punto de entrada: Perú, donde **$800M+ en remesas anuales** llegan sin ninguna herramienta de ahorro asociada *(Banco Mundial, 2024)*.
- *Pendiente de refinar con investigación de mercado primaria: TAM/SAM/SOM en dólares, tasa de penetración esperada, y comparables de adopción de fintech LATAM (Nubank, Ualá) en sus primeros 24 meses.*

---

## 6. Modelo de negocio

**Por qué es necesaria:** esta es la diapositiva que separa "proyecto con propósito" de "empresa". Tiene que responder, sin rodeos, de dónde sale la plata — y en el caso de Propulsor, tiene que responder además la pregunta que cualquier inversor serio en fintech de inclusión financiera va a hacer: *¿le estás cobrando a la gente que menos tiene?* La respuesta tiene que ser no, y tiene que quedar demostrado, no declarado.

**Contenido:**

**Principio rector:** nunca cobrarle al usuario por ahorrar. Nunca tocar el capital. Nunca cobrar una tarifa fija — un fee de $2 es invisible sobre $5,000 y devastador sobre $50, y ese es exactamente el usuario que Propulsor sirve.

| Capa | Qué es | A quién le cobra | Por qué no le pesa al usuario |
|---|---|---|---|
| **1. Producto base** | Separación automática, bóvedas, bloqueos por fecha/meta | Nadie — gratis siempre | Es el núcleo de confianza del producto; cobrar acá contradice la propuesta de valor completa |
| **2. Rendimiento compartido** | Un % del *rendimiento generado* en Blend Protocol (no del capital) | Solo se cobra cuando hay ganancia | Blend Protocol no cobra nada sobre el interés generado — el margen que toma Propulsor sale de una ganancia que el usuario no tendría de otra forma, nunca de lo que ya tenía |
| **3. Verificación B2B2C** | Un prestamista, arrendador o plataforma paga por verificar una prueba de ahorro del usuario | La institución que se beneficia de reducir su riesgo — no el usuario | El usuario genera y comparte su prueba gratis; el que paga es quien necesita el dato, no quien lo posee |
| **4. Spread de conversión (fase posterior)** | Un margen pequeño y transparente al convertir soles → USDC, vía un anchor licenciado | El usuario, mínimamente | Solo se activa cuando el spread es claramente menor al que ya cobran remesadoras tradicionales (5–8%+) — si no es una mejora real, no se cobra |

**Lo que Propulsor explícitamente no va a hacer:**
- Cobrar suscripción mensual o comisión fija — regresivo por diseño.
- Cobrar por retirar o acceder a la propia plata — castigaría exactamente la conducta que el producto busca fomentar.
- Vender datos de usuarios — sería contradecir la razón de ser del producto: la privacidad es la promesa central.
- Ofrecer préstamos con intereses altos contra los ahorros — es el giro predatorio clásico de muchas fintech de "inclusión financiera" una vez que tienen depósitos; Propulsor no lo va a tomar.

---

## 7. Panorama competitivo

**Por qué es necesaria:** "no tenemos competencia" suena a que no investigaste. La versión creíble es mostrar qué existe cerca, y ser precisa sobre qué parte de tu combinación nadie más tiene todavía.

**Contenido:**

| Quién | Qué hace | Qué le falta frente a Propulsor |
|---|---|---|
| **Nubank (Caixinhas)** | Sub-cuentas de ahorro por meta, la analogía de UX más cercana en LATAM | Asignación **manual** (el usuario mueve la plata él mismo), modelo custodial/centralizado, sin capa de privacidad, requiere cuenta bancaria — excluye exactamente al no bancarizado |
| **Ualá, RappiPay y similares** | Tarjeta prepaga + gestión financiera personal | Sin mecanismo de auto-reparto al instante de recibir, sin rieles cripto para remesas cross-border |
| **Wallets de agentes IA en cripto (2026)** | Agentes que optimizan rendimiento/trading DeFi con capital delegado | Objetivo opuesto: maximizar retorno sobre capital ya invertido — no proteger un ingreso apenas llega |
| **Infraestructura ZK institucional** (proof-of-reserves, compliance bancario) | Prueba criptográfica de solvencia, pero como herramienta B2B entre instituciones | Nadie lo empaquetó como feature de cara al consumidor final, para que una persona demuestre solvencia sin exponer su balance |

**La diferenciación real de Propulsor no es ninguna pieza aislada — es la combinación:** reparto instantáneo disparado por un agente autónomo + rieles cripto de auto-custodia + prueba de privacidad verificable on-chain + foco específico en el trabajador informal desatendido. Ningún jugador identificado combina las cuatro.

---

## 8. Estado actual / Tracción técnica

**Por qué es necesaria:** en etapa pre-usuarios, "tracción" no es ingresos ni MAU — es evidencia de que el equipo ejecuta. Mostrar qué está construido y funcionando (no en diapositivas, en testnet real) es la forma honesta de demostrar velocidad de ejecución.

**Contenido:**

- ✅ Contratos `SplitProtocol` y `TimeVault` desplegados y funcionando en Stellar Testnet
- ✅ Agente autónomo (x402) detectando pagos y ejecutando reparto sin intervención humana
- ✅ Integración de rendimiento automático con Blend Protocol
- ✅ Capa de privacidad ZK (Groth16/BLS12-381) verificando pruebas on-chain
- ✅ Segunda capa de privacidad (RISC Zero zkVM) con verificador BN254 desplegado y una prueba real verificada en cadena
- 🧪 Rampa de entrada fiat (SEP-24) implementada y probada contra el anchor de referencia de Stellar
- Validado en tres instancias competitivas: **She Ships 2026**, **Stellar Agentic Payments Hackathon**, **Stellar Hacks — Real-World ZK**

---

## 9. Go-to-market

**Por qué es necesaria:** un producto con cero usuarios no convence por sí solo — necesita un plan creíble de cómo llegan los primeros mil, y por qué esos primeros mil traen a los siguientes diez mil.

**Contenido:**

- **Distribución vía remesas, no vía descarga fría:** el momento de mayor intención es cuando la plata llega — asociarse con quien ya envía la remesa (operadores, plataformas gig, empleadores) es más eficiente que competir por atención genérica.
- **Efecto comunidad, no publicidad paga:** el producto nace en un hackathon centrado en mujeres (She Ships 2026) — la primera ola de usuarias son también la primera red de referidos naturales dentro de comunidades de trabajo informal.
- **La privacidad como gancho de confianza, no de nicho:** "demostrá que ahorrás sin decir cuánto" es un mensaje que se explica solo y resuelve una ansiedad real (familia, prestamistas informales) — no requiere que el usuario entienda qué es zero-knowledge.
- **Expansión geográfica ordenada:** Perú primero (ya hay datos y contexto validado), luego mercados con perfil de remesas y economía informal comparable en la región.

---

## 10. Roadmap

**Por qué es necesaria:** conecta "lo que ya funciona" (sección 8) con "a dónde va la plata que estás pidiendo" — sin esto, el ask de la última diapositiva flota sin justificación.

**Contenido:**

- **Corto plazo:** salir de testnet a mainnet; cerrar acuerdo con un anchor SEP-24 licenciado (hoy se usa el anchor de referencia de Stellar, solo para pruebas); primeros usuarios reales en Perú.
- **Mediano plazo:** activar la capa 2 del modelo de negocio (rendimiento compartido) una vez que haya depósitos reales en Blend; iniciar conversaciones comerciales con prestamistas/arrendadores para la verificación B2B2C.
- **Largo plazo:** expansión a nuevos mercados LATAM; spread de conversión propio una vez asegurado un anchor licenciado competitivo.

---

## 11. Equipo

**Por qué es necesaria:** en etapa pre-seed, los inversores apuestan tanto al equipo como a la idea. Esta diapositiva necesita nombres, roles y por qué *este* equipo es el correcto para *este* problema — completala con esa información antes de presentar.

**Contenido (placeholder a completar):**

> Construido con 💜 en Lima, Perú.
>
> *[Espacio para: nombres, roles, background relevante — fintech, cripto, o la propia experiencia vivida con la economía informal/remesas que motivó el proyecto. Un inversor de inclusión financiera valora tanto la cercanía al problema real como la capacidad técnica.]*

---

## 12. El ask

**Por qué es necesaria:** es la única diapositiva que le dice a la sala qué hacer después de escucharte. Sin un ask concreto (monto, para qué se usa, qué te desbloquea), una reunión de pitch termina en "genial, seguimos en contacto" — no en un siguiente paso real.

**Contenido (placeholder a completar):**

> *[Completar: monto que estás buscando, tipo de ronda (pre-seed / ángel / alianza estratégica), y los 3 hitos concretos que ese capital te permite alcanzar — ej. licencia de anchor, primeros N usuarios reales, lanzamiento a mainnet. Sé específica: "$X para lograr Y en Z meses" convence más que "buscamos inversión".]*

---

## 13. Cierre

**Por qué es necesaria:** la última imagen que se lleva la sala. Tiene que volver a la emoción de la diapositiva 1, ya con la credibilidad técnica y de negocio que construiste en el medio.

**Contenido:**

> El sistema no fue diseñado para ellos. Propulsor sí.
>
> No se trata de intentar ahorrar. Se trata de que el código cuide tu dinero — desde el segundo en que llega.

---

## Fuentes citadas

- 70% de trabajadores informales sin control financiero real — BID, 2024
- $800M+ en remesas anuales a Perú sin herramientas de ahorro — Banco Mundial, 2024
- 23% de hogares en economía informal con ahorro formal — INEI, 2024
- Nubank Caixinhas (modelo manual/centralizado) — [building.nubank.com](https://building.nubank.com/how-nubank-launched-caixinhas/)
- Blend Protocol no retiene comisión sobre interés generado — [defillama.com/protocol/blend](https://defillama.com/protocol/blend), [docs.blend.capital](https://docs.blend.capital/users/general-faq)
- CAP-0074 (verificación BN254 on-chain) en Protocolo 25 — [stellar-protocol/cap-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md)
