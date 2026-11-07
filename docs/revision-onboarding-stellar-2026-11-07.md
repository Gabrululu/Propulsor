# Revisión inicial de onboarding y Stellar — 7 de noviembre de 2026

El estado actualizado de estos pendientes está en [Ejecución de pendientes](./ejecucion-pendientes.md). Los límites que siguen reflejan la revisión inicial, antes de ejecutar esa segunda etapa.

## Cambios implementados

| Punto revisado | Resultado |
| --- | --- |
| Errores técnicos sin filtrar | `userError` traduce conexión, simulación, PIN incorrecto, cancelación de firma, activación y guardado. Los errores desconocidos tienen un mensaje seguro con siguiente paso. Respeta español/inglés. |
| Friendbot silencioso | Tres intentos, espera progresiva y límite de 15 segundos por petición. Una respuesta negativa comprueba si la cuenta ya existe antes de repetir. Al agotar intentos, lanza un error y detiene la creación. |
| Reintento confuso | Error visible en el formulario, estado ocupado, bloqueo de doble envío y PIN borrado al terminar cada intento. |
| Perfil completo antes de reglas | `onboarding_complete` y el comprobante se guardan juntos después de que `setRules` confirme. No se navega al dashboard si falla el perfil. |
| Fallo de guardado ignorado | Tanto el onboarding como la creación de cuenta propagan un error visible. Si el reparto se confirmó pero falló el perfil, el reintento conserva el hash en memoria y solo guarda el perfil. |
| PIN en cuatro cuadros | Componente compartido de un campo, teclado numérico, pegado/borrado normales, `autoComplete="off"`, etiqueta y ayuda vinculadas. |
| PIN repetido y recuperación | Mismo formato para creación, repetición para evitar errores y autorización del reparto. Se explica por qué se solicita y que no hay recuperación del PIN. No se mantiene el PIN de creación entre pantallas. |
| Voz por hover/touch | Botones explícitos e independientes para bienvenida, perfiles e instrucciones del PIN. Los errores se narran. No hay bienvenida automática bloqueada por autoplay. |
| Selección de voz | Idioma de la interfaz; preferencia es-PE, luego es-MX y otra voz española disponible. Se elimina la búsqueda por “female”. |
| Accesibilidad | Etiquetas de campos, selección anunciada con `aria-pressed`, foco en título al cambiar paso, progreso etiquetado, estados y errores anunciados, formularios bloqueados durante guardado. |
| Sliders | Área de 44 px, control nativo por teclado y tacto, nombre y valor accesibles, ejemplo “Si recibes S/100 → S/60 para Hogar”. Se explica el ajuste de las otras barras. |
| Jerga | “Crear mi cuenta” como acción principal; aplicaciones externas plegadas con explicación de wallet; bóveda explicada como espacio de dinero. |
| Idioma | Onboarding y conexión consumen `useLanguage`, incluidos mensajes, voz y ejemplos de reparto. |
| Código muerto | Se elimina `StellarAccountSetup.tsx`, sin importaciones en el proyecto. |
| Promesa de duración | Se elimina “Solo toma 3 minutos”. El tiempo real queda por medir con participantes. |

## Actualizaciones de Stellar verificadas

- La [guía oficial Bell / Protocolo 30](https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide), actualizada el 23 de octubre, exige actualizar los SDK por cambios XDR del encabezado del ledger. Establece votaciones para testnet el 3 de noviembre y mainnet el 23 de noviembre de 2026; esas fechas por sí solas no demuestran la activación. Recomienda JavaScript 17.3.0 con soporte de direcciones W; 16.4.0 solo cubre la decodificación de ledgers.
- Se actualiza el frontend de 14.6.1 a [17.4.0](https://github.com/stellar/js-stellar-sdk/releases/tag/v17.4.0), versión estable consultada en npm. Se actualiza `package-lock.json` y se exige Node >=22. El [changelog oficial](https://raw.githubusercontent.com/stellar/js-stellar-sdk/master/CHANGELOG.md) describe los cambios mayores: Stellar Base integrado en SDK, cliente HTTP fetch, importaciones y tipos actualizados. TypeScript, build de producción y las 14 pruebas pasan con esta versión.
- `getSorobanServer` solo buscaba `SorobanRpc`/`Soroban`: ahora reconoce `rpc.Server`, el módulo actual. El cliente de contratos ya utilizaba `S.rpc`.
- [Friendbot oficial](https://github.com/stellar/friendbot) sigue disponible en `https://friendbot.stellar.org` con parámetro `addr`. No se encontró motivo para cambiar ese endpoint.
- La [documentación de Horizon](https://developers.stellar.org/docs/data/apis/horizon) sigue describiendo las consultas utilizadas por el proyecto. No se considera una API eliminada. Conviene planificar la transición de acceso a datos hacia RPC; no se sustituye todo Horizon como parte de esta corrección.
- La guía Bell afirma que contratos existentes continúan funcionando sin recompilar. El SDK Rust fijado en 22.0.10 no se actualiza como consecuencia automática del cambio del SDK JavaScript. Para adoptar funciones nuevas deberá alinearse con SDK/CLI correspondientes.

## Pendientes y límites

1. **Agent y ZK:** `agent/package.json` y `zk/package.json` aún fijan SDK ^14.6.1. Requieren migración y validación independiente, especialmente dependencias x402 y envío/verificación ZK. El workflow ZK usa Node 20; al migrar deberá usar >=22. No se afirma compatibilidad completa del proyecto con Protocolo 30.
2. **Instalación reproducible:** se valida npm y su lockfile, como indica README. `bun.lock` y `pnpm-lock.yaml` existentes no se regeneraron; los usuarios de esos gestores deben regenerarlos antes de usar instalación congelada.
3. **Transacción y base de datos no son atómicas:** el hash se conserva durante el reintento en esta pantalla. Una recarga tras confirmar en cadena y antes de guardar el perfil pierde ese estado local. Para recuperación duradera, hace falta reconciliar reglas en cadena con un registro persistente de operación pendiente. Tampoco se reparan automáticamente perfiles antiguos ya marcados completos por el bug anterior.
4. **Red de prueba:** no se han verificado en vivo las cuentas ni la existencia de los contratos predeterminados tras posibles resets. El onboarding identifica que los fondos son de prueba. Una cuenta social existente todavía puede tener un indicador de fondeo obsoleto tras un reset.
5. **Pruebas de experiencia:** quedan sesiones con los cinco participantes para medir duración, comprensión, uso con teclado/lector de pantalla, voz en navegadores móviles y control táctil en teléfonos reales. Los atributos y pruebas automatizadas no certifican accesibilidad completa. El modal no embebido aún necesita una revisión específica de confinamiento/restauración del foco.
6. **Validación:** TypeScript, build de producción, lint de archivos modificados y 14 pruebas pasan. Hay pruebas de regresión para confirmación previa a persistencia, fallo de contrato sin perfil completo, PIN borrado, reintento sin segunda firma, errores seguros y Friendbot con fallo transitorio/persistente/cuenta existente. El lint global conserva errores ajenos a estos cambios en `src/types/snarkjs.d.ts`, `supabase/functions/agent-webhook/index.ts` y `tailwind.config.ts`.
