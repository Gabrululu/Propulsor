import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useVoice } from "@/hooks/useVoice";
import { userError } from "@/lib/userErrors";
import PinInput from "@/components/PinInput";
import {
  kit,
  FREIGHTER_ID,
  XBULL_ID,
  ALBEDO_ID,
  LOBSTR_ID,
  type WalletId,
} from "@/lib/stellar/wallets-kit";

interface ConnectModalProps {
  embedded?: boolean;
  onClose?: () => void;
  onConnected: (mode: "custodial" | "external", publicKey: string) => void;
}
const wallets: { id: WalletId; name: string }[] = [
  { id: FREIGHTER_ID, name: "Varial" },
  { id: XBULL_ID, name: "xBull" },
  { id: ALBEDO_ID, name: "Albedo" },
  { id: LOBSTR_ID, name: "Lobstr" },
];

export default function ConnectModal({
  embedded = false,
  onConnected,
  onClose,
}: ConnectModalProps) {
  const { connectCustodial, connectExternal, isConnecting } = useWallet();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { speak } = useVoice();
  const text = (es: string, en: string) => (language === "es" ? es : en);
  const [open, setOpen] = useState(true);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const recovery = text(
    "Guarda tu PIN en un lugar seguro. Lo necesitarás para autorizar cambios. Si lo olvidas, no podremos recuperar el acceso con este PIN.",
    "Keep your PIN somewhere safe. You will need it to authorize changes. If you forget it, we cannot recover access using this PIN.",
  );
  const fail = (err: unknown) => {
    const message = userError(err, language);
    setError(message);
    speak(message);
  };
  const create = async () => {
    if (busy || isConnecting) return;
    if (pin !== confirmation) {
      const message = text(
        "Los PIN no coinciden. Vuelve a ingresarlos.",
        "The PINs do not match. Enter them again.",
      );
      setError(message);
      speak(message);
      setPin("");
      setConfirmation("");
      return;
    }
    if (!user || pin.length !== 4) {
      const message = text(
        "Inicia sesión e ingresa un PIN de 4 dígitos.",
        "Sign in and enter a 4-digit PIN.",
      );
      setError(message);
      speak(message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const pk = await connectCustodial(user.id, pin);
      onConnected("custodial", pk);
    } catch (err) {
      fail(err);
    } finally {
      setPin("");
      setConfirmation("");
      setBusy(false);
    }
  };
  const connect = async (id: WalletId) => {
    if (busy || isConnecting) return;
    setBusy(true);
    setError("");
    try {
      await connectExternal(id);
      const { address } = await kit.getAddress();
      onConnected("external", address);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const content = (
    <div className="w-full space-y-5" aria-busy={busy}>
      <p className="text-sm text-muted-foreground">
        {text(
          "Estás en una red de prueba: los fondos no son dinero real.",
          "You are on a test network: funds are not real money.",
        )}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">
          {text(
            "Preparando tu cuenta. La activación puede tardar; reintentamos automáticamente si hace falta…",
            "Preparing your account. Activation may take a while; we retry automatically if needed…",
          )}
        </p>
      ) : creating ? (
        <>
          <PinInput
            label={text("Crea un PIN de 4 dígitos", "Create a 4-digit PIN")}
            value={pin}
            onChange={setPin}
            description={recovery}
          />
          <button
            onClick={() => speak(recovery)}
            className="min-h-11 text-primary"
          >
            {text(
              "Escuchar instrucciones del PIN",
              "Listen to PIN instructions",
            )}
          </button>
          <PinInput
            label={text(
              "Repite el PIN para evitar errores",
              "Repeat the PIN to avoid mistakes",
            )}
            value={confirmation}
            onChange={setConfirmation}
          />
          <button
            onClick={create}
            disabled={pin.length !== 4 || confirmation.length !== 4}
            className="btn-pink w-full"
          >
            {text("Crear mi cuenta", "Create my account")}
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setPin("");
              setConfirmation("");
              setError("");
            }}
            className="min-h-11 w-full"
          >
            {text("Volver", "Back")}
          </button>
        </>
      ) : (
        <>
          <p>
            {text(
              "Solo necesitas un PIN de 4 dígitos para crear tu cuenta.",
              "You only need a 4-digit PIN to create your account.",
            )}
          </p>
          <button onClick={() => setCreating(true)} className="btn-pink w-full">
            {text("Crear mi cuenta", "Create my account")}
          </button>
          <details>
            <summary className="min-h-11 cursor-pointer text-muted-foreground">
              {text(
                "Ya tengo una cuenta en otra aplicación (wallet)",
                "I already have an account in another app (wallet)",
              )}
            </summary>
            <p className="text-sm mb-3">
              {text(
                "Una wallet es una aplicación para administrar tu cuenta. Elige la que ya utilizas.",
                "A wallet is an app for managing your account. Choose the one you already use.",
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {wallets.map((w) => (
                <button
                  key={w.id}
                  onClick={() => connect(w.id)}
                  className="min-h-12 border border-border rounded-sm p-3"
                >
                  {w.name}
                </button>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
  if (embedded) return content;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        if (!value) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto bg-card border border-border p-6"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previousFocus.current?.focus();
          }}
        >
          <Dialog.Title className="text-xl font-bold mb-4">
            {text("Crear o conectar cuenta", "Create or connect account")}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {text(
              "Crea tu cuenta con un PIN o conecta una cuenta existente.",
              "Create your account with a PIN or connect an existing account.",
            )}
          </Dialog.Description>
          {content}
          <Dialog.Close disabled={busy} className="min-h-11 w-full mt-4">
            {text("Cerrar", "Close")}
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
