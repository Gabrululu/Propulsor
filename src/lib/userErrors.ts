import type { Language } from "./i18n/translations";

/** Never expose SDK messages, transaction payloads or server responses to users. */
export function userError(error: unknown, language: Language = "es"): string {
  const value =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
  const messages: [RegExp, string, string][] = [
    [
      /ONBOARDING_CONFLICT/,
      "Tu configuración cambió en otra pestaña o dispositivo. Recarga esta página para recuperar el último intento antes de continuar.",
      "Your setup changed in another tab or device. Reload this page to recover the latest attempt before continuing.",
    ],
    [
      /TRANSACTION_PENDING/,
      "Tu reparto sigue pendiente de confirmación. Espera unos segundos y pulsa Comprobar y continuar; no necesitas volver a autorizarlo.",
      "Your split is still awaiting confirmation. Wait a few seconds and select Check and continue; no new authorization is needed.",
    ],
    [
      /TRANSACTION_RETRY/,
      "El intento anterior no se confirmó. Ya puedes volver a autorizar el reparto con tu PIN o tu aplicación de cuenta.",
      "The previous attempt was not confirmed. You can now authorize the split again using your PIN or account app.",
    ],
    [
      /ACCOUNT_FUNDING_FAILED/i,
      "No pudimos activar tu cuenta de prueba después de varios intentos. Comprueba tu conexión y vuelve a crearla.",
      "We could not activate your test account after several attempts. Check your connection and try again.",
    ],
    [
      /PROFILE_SAVE_FAILED/i,
      "No pudimos guardar tu perfil. Comprueba tu conexión y vuelve a intentarlo.",
      "We could not save your profile. Check your connection and try again.",
    ],
    [
      /FAUCET_UNAVAILABLE/,
      "El faucet de Blend no respondió. Vuelve a intentarlo en unos minutos.",
      "Blend's faucet did not respond. Try again in a few minutes.",
    ],
    [
      /FAUCET_TX_REJECTED/,
      "La transacción del faucet hacía algo distinto a enviarte USDC de prueba, así que no la firmamos.",
      "The faucet transaction did more than send you test USDC, so we did not sign it.",
    ],
    [
      /YIELD_UNAVAILABLE/,
      "No pudimos leer el protocolo de rendimiento. Vuelve a intentarlo en unos segundos.",
      "We could not read the yield protocol. Try again in a few seconds.",
    ],
    [
      /NOTHING_TO_WITHDRAW/,
      "No tienes fondos depositados en este protocolo.",
      "You have no funds deposited in this protocol.",
    ],
    [
      /INVALID_AMOUNT/,
      "Ingresa un monto mayor que cero.",
      "Enter an amount greater than zero.",
    ],
    [
      /WRONG_NETWORK/,
      "Tu wallet está en otra red. Cámbiala a Testnet y vuelve a intentarlo.",
      "Your wallet is on another network. Switch it to Testnet and try again.",
    ],
    [
      /WALLET_KEY_UNAVAILABLE/,
      "No pudimos acceder a tu cuenta segura. Comprueba tu conexión y vuelve a intentarlo.",
      "We could not access your secure account. Check your connection and try again.",
    ],
    [
      /INCORRECT_PIN|OperationError|incorrect.*pin|pin.*incorrect/i,
      "El PIN no es correcto. Ingresa tus 4 dígitos e inténtalo de nuevo.",
      "Incorrect PIN. Enter your 4 digits and try again.",
    ],
    [
      /reject|denied|declined|cancel|rechaz/i,
      "Cancelaste la autorización. Vuelve a intentarlo y acepta la solicitud en tu aplicación de cuenta.",
      "Authorization was cancelled. Try again and approve the request in your account app.",
    ],
    [
      /fetch|network|offline|timeout|timed out|conexión/i,
      "No pudimos conectar. Revisa tu internet y vuelve a intentarlo.",
      "We could not connect. Check your internet and try again.",
    ],
    [
      /simulat|simulaci|HostError|restore|archived/i,
      "No pudimos preparar el reparto. Inténtalo de nuevo; si continúa, solicita ayuda para revisar la cuenta de prueba.",
      "We could not prepare the split. Try again; if it persists, ask for help checking your test account.",
    ],
    [
      /not found|not funded|insufficient|balance|account.*exist/i,
      "Tu cuenta de prueba no está disponible o no tiene fondos suficientes. Solicita ayuda para reactivarla.",
      "Your test account is unavailable or has insufficient funds. Ask for help reactivating it.",
    ],
  ];
  const match = messages.find(([pattern]) => pattern.test(value));
  return match
    ? match[language === "es" ? 1 : 2]
    : language === "es"
      ? "No pudimos completar este paso. Vuelve a intentarlo; si continúa, solicita ayuda."
      : "We could not complete this step. Try again; if it persists, ask for help.";
}
