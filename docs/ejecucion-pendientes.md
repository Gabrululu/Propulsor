# Ejecución de pendientes — 7 de noviembre de 2026

## 1. Migración y pnpm: implementado y comprobado

Frontend, agente y ZK usan Stellar SDK 17.4.0, Node >=22 y pnpm 10.32.1.
Cada paquete tiene `pnpm-lock.yaml`; se retiraron los lockfiles de npm/Bun para evitar selección accidental del gestor anterior. Railway, Procfile y el workflow ZK usan pnpm; el workflow ZK usa Node 22. No es un workspace: cada servicio se puede instalar independientemente usando su carpeta como raíz de despliegue.

```sh
pnpm install --frozen-lockfile
pnpm --dir agent install --frozen-lockfile
pnpm --dir zk install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:migration
pnpm build
pnpm --dir agent test:smoke
pnpm --dir zk typecheck
pnpm exec playwright install chromium
pnpm test:e2e
```

**Resultado local:** 35 pruebas de lógica, 6 pruebas de navegador, migración PostgreSQL, TypeScript del frontend/ZK, compilación del agente/frontend y smoke del agente aprobados. Lint global sin errores; conserva avisos de Fast Refresh.

`Validate Propulsor` ejecuta estas verificaciones en pull requests y en main. Las pruebas locales de navegador utilizan respuestas de servicios simuladas, sin credenciales ni fondos de usuarios. El smoke del agente usa un facilitador local para comprobar el desafío x402 sin pagar ni enviar transacciones.

## 2. Recuperación duradera: implementada, migración lista

La nueva migración `supabase/migrations/20261107090000_recover_onboarding.sql` añade `onboarding_draft` y `split_contract_tx`, y dos funciones con permisos de usuario autenticado y RLS:

- `save_onboarding_draft`: guarda el intento antes de firmar y su hash antes de transmitirlo. Bloquea reemplazar otro hash pendiente desde una segunda pestaña/dispositivo. Comprueba que la sesión corresponde al usuario que inició la operación.
- `complete_onboarding`: guarda el perfil y su comprobante y limpia el borrador en una sola operación; reintentar el mismo hash ya completado es idempotente.

No se guarda el PIN, la clave secreta ni una transacción firmada en el borrador. Al recargar se restaura el formulario y se consulta el hash. Si está pendiente, no se ofrece otra firma. Si desapareció por retención de RPC, se contrastan las reglas en cadena; un error de red no se interpreta como ausencia de reglas. Se usa el reloj del ledger para evaluar vencimiento.

Los accesos a dashboard y los inicios de sesión verifican reglas reales y corrigen perfiles antiguos marcados completos sin reglas. La restauración de cuentas comprueba el fondeo actual, reactiva la misma dirección de Testnet si es necesario y conserva el modo con PIN cuando corresponde.

La migración se probó en PostgreSQL local con PGlite: RLS del propietario, rechazo de anónimos, protección contra reemplazo de un hash pendiente, finalización atómica, reintento idempotente y conservación del borrador al fallar.

## 3. Stellar Testnet: comprobado en vivo, sin redeploy necesario

La consulta RPC devolvió Protocolo 30. Los cuatro contratos configurados están presentes. Se creó una cuenta desechable solo para la prueba, se fondeó con Friendbot y se confirmó `set_rules` con 60/30/10:

[Transacción de prueba confirmada](https://stellar.expert/explorer/testnet/tx/5be1db1ddcce46f714025ef1a3f9709103f0252771b99e66c4ab08114b1b8e3b).

Se leyeron las mismas reglas y respondieron `TimeVault.check_release`, `ProofOfVaultVerifier.is_used` y `ConsistentSavingVerifier.is_used`. No se verificó una prueba ZK nueva en cadena: eso requiere una prueba válida y su firmante, y no es necesario para esta migración de cliente.

Puede repetirse la inspección con `pnpm check:stellar`. `pnpm check:stellar --smoke` crea otra cuenta desechable y envía una transacción de prueba; no carga secretos de usuarios existentes.

## 4. Accesibilidad y móvil: comprobaciones automatizadas listas

Pruebas Chromium en escritorio y móvil de 360 px: selección separada de voz, PIN y borrado, errores, ausencia de desbordamiento horizontal, progreso, sliders, recuperación tras recarga y foco del diálogo (confinamiento, Escape y restauración). Axe revisa las pantallas de perfil, reparto recuperado y diálogo. Las pruebas no sustituyen sesiones humanas ni Safari/VoiceOver o teléfonos físicos de gama baja.

El protocolo para las cinco personas está en `docs/sesiones-usabilidad.md`. Todavía no se ejecutaron esas sesiones ni se promete una duración.

## 5. Despliegue: orden y acceso pendiente

El frontend y su backend pertenecen a Lovable, confirmado por el propietario. GitHub indica `https://propulsor.lovable.app` como homepage; Railway tiene el proyecto `03f1de9c-ab6a-4415-911f-3faf0672d71e` y entorno `fcd39ee2-63e1-4439-9173-b648bc804793` en el historial de despliegue. Main está protegida. No se modifica esa protección ni se usa un merge administrativo.

Orden requerido:

1. Aplicar la nueva migración al Supabase gestionado por Lovable. Comprobar las dos columnas y funciones con el usuario autenticado de prueba.
2. Integrar la entrega revisada con los checks de GitHub aprobados.
3. Publicar el frontend desde Lovable; sincronizar código con GitHub por sí solo no constituye evidencia de publicación.
4. Redeplegar servidor y monitor de Railway usando `agent` como carpeta raíz, Node 22 y el lockfile de pnpm. Verificar `/health`, configuración de contratos y reinicio del monitor. No ejecutar `agent setup` sobre cuentas reales para este cambio.
5. Comprobar en la URL publicada un onboarding de prueba, recuperación tras recarga y un reintento de guardado. Desplegar también el ajuste de `agent-webhook` si se incluye esa función en la publicación de Lovable.

En este entorno no hay una sesión de despliegue de Lovable, Railway ni Supabase. Se encontraron integraciones disponibles para esos servicios, pero no se confirmó su conexión. La migración y publicación de producción no se consideran realizadas. No publicar el frontend antes de aplicar su migración.
