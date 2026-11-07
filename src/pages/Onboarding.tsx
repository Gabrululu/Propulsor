import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PercentageSlider from "@/components/PercentageSlider";
import PinInput from "@/components/PinInput";
import ConnectModal from "@/components/stellar/ConnectModal";
import { useVoice } from "@/hooks/useVoice";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useContracts } from "@/hooks/useContracts";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { userError } from "@/lib/userErrors";
import {
  createDraft,
  loadDraft,
  saveDraft,
  recoverDraft,
  completeDraft,
  type OnboardingDraft,
} from "@/lib/onboarding";

export default function Onboarding() {
  const { language } = useLanguage();
  const text = (es: string, en: string) => (language === "es" ? es : en);
  const profiles = [
    {
      key: "jefa_hogar",
      label: text("Responsable del hogar", "Household manager"),
      description: text(
        "Gestionas los gastos del hogar y cuidas a tu familia.",
        "You manage household expenses and care for your family.",
      ),
      split: [60, 30, 10],
    },
    {
      key: "emprendedora",
      label: text("Negocio propio", "Business owner"),
      description: text(
        "Tienes tu propio negocio o vendes por tu cuenta.",
        "You run a business or sell independently.",
      ),
      split: [40, 30, 30],
    },
    {
      key: "trabajadora",
      label: text("Empleo fijo", "Regular employment"),
      description: text(
        "Recibes un sueldo fijo cada quincena o mes.",
        "You receive a regular salary.",
      ),
      split: [50, 35, 15],
    },
    {
      key: "freelancer",
      label: text("Trabajo independiente", "Freelancer"),
      description: text(
        "Tus ingresos varían según tus proyectos.",
        "Your income varies with your projects.",
      ),
      split: [45, 30, 25],
    },
  ];
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [profileType, setProfileType] = useState("");
  const [percentages, setPercentages] = useState([60, 30, 10]);
  const [vaultNames, setVaultNames] = useState<string[] | null>(null);
  const names = vaultNames ?? [
    text("Hogar", "Home"),
    text("Fondo seguro", "Safety fund"),
    text("Meta grande", "Big goal"),
  ];
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  // Keep a confirmed transaction across profile-save retries. Never sign twice just to save a profile.
  const [txHash, setTxHash] = useState("");
  const [journal, setJournal] = useState<OnboardingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { speak, stop, isSpeaking } = useVoice();
  const { user } = useAuth();
  const { mode, publicKey } = useWallet();
  const contracts = useContracts();
  const isCustodial = mode === "custodial";
  const welcome = text(
    "Te damos la bienvenida a Propulsor. Te ayudaremos a separar tu dinero en tres espacios para tus gastos y metas. Puedes escuchar las instrucciones con los botones de voz.",
    "Welcome to Propulsor. We will help you split your money into three spaces for expenses and goals. Use the audio buttons to hear instructions.",
  );
  const pinHelp = text(
    "Ingresa el PIN que creaste para autorizar este reparto. Si lo olvidaste, no podremos recuperar el acceso con este PIN.",
    "Enter the PIN you created to authorize this split. If you forgot it, we cannot recover access using this PIN.",
  );
  useEffect(() => {
    if (step === 2 && publicKey && mode) setStep(3);
  }, [step, publicKey, mode]);
  useEffect(() => {
    heading.current?.focus();
  }, [step, done]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setRecoveryFailed(false);
    if (!user?.id || !publicKey) {
      setReady(true);
      return;
    }
    loadDraft(user.id, publicKey)
      .then((draft) => {
        if (cancelled || !draft) return;
        setJournal(draft);
        setName(draft.name);
        setProfileType(draft.profileType);
        setVaultNames(draft.vaultNames);
        setPercentages(draft.percentages);
        setStep(3);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(userError(err, language));
          setRecoveryFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, publicKey, language, reload]);

  const deploy = async () => {
    if (
      inFlight.current ||
      !ready ||
      recoveryFailed ||
      (isCustodial && !txHash && !journal?.transaction && pin.length !== 4)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!user || !publicKey) throw new Error("PROFILE_SAVE_FAILED");
      let draft =
        journal ??
        createDraft({
          publicKey,
          name,
          profileType: profileType as OnboardingDraft["profileType"],
          vaultNames: names,
          percentages,
        });
      let hash = txHash;
      if (!hash && draft.transaction) {
        const status = await recoverDraft(draft);
        if (status === "pending") throw new Error("TRANSACTION_PENDING");
        if (status === "retry") {
          const previousHash = draft.transaction.hash;
          draft = { ...draft, transaction: undefined };
          await saveDraft(user.id, draft, previousHash);
          setJournal(draft);
          throw new Error("TRANSACTION_RETRY");
        }
        hash = draft.transaction.hash;
        setTxHash(hash);
      }
      if (!hash) {
        // Save the intent before signing; persist its hash before broadcasting.
        draft = createDraft({
          publicKey,
          name,
          profileType: profileType as OnboardingDraft["profileType"],
          vaultNames: names,
          percentages,
        });
        await saveDraft(user.id, draft);
        setJournal(draft);
        hash = await contracts.setRules(
          draft.percentages.map((percentage, vault_id) => ({
            vault_id,
            percentage,
          })),
          isCustodial ? pin : undefined,
          undefined,
          async (transaction) => {
            draft = { ...draft, transaction };
            await saveDraft(user.id, draft);
            setJournal(draft);
          },
        );
        setTxHash(hash);
      }
      await completeDraft(user.id, draft, hash);
      await queryClient.invalidateQueries({
        queryKey: ["onboarding", user.id],
      });
      setDone(true);
      speak(
        text(
          "Tu reparto está configurado. Puedes continuar a tu cuenta.",
          "Your split is configured. You can continue to your account.",
        ),
      );
    } catch (err) {
      const message = userError(err, language);
      setError(message);
      speak(message);
    } finally {
      setPin("");
      setBusy(false);
      inFlight.current = false;
    }
  };
  const titles = [
    text("Protege tu dinero", "Protect your money"),
    text("Configura tu perfil", "Set up your profile"),
    text("Crea o conecta tu cuenta", "Create or connect your account"),
    text("Define tu reparto", "Set your split"),
  ];
  return (
    <main
      className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6"
      lang={language}
    >
      <div className="w-full max-w-lg space-y-6" aria-busy={busy}>
        <div
          role="progressbar"
          aria-label={text("Configuración de tu cuenta", "Account setup")}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={step + 1}
          className="flex gap-2"
        >
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-sm ${s <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {text("Paso", "Step")} {step + 1} {text("de", "of")} 4
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-bold focus:outline-none"
        >
          {done
            ? text("Tu reparto está listo", "Your split is ready")
            : titles[step]}
        </h1>
        {error && (
          <div role="alert" className="border border-destructive p-4 space-y-2">
            <p>{error}</p>
            {txHash && (
              <p>
                {text(
                  "El reparto ya se confirmó. Reintentar solo guardará tu perfil.",
                  "Your split is confirmed. Retrying will only save your profile.",
                )}
              </p>
            )}
          </div>
        )}
        {!ready ? (
          <p role="status">
            {text("Recuperando tu configuración…", "Restoring your setup…")}
          </p>
        ) : recoveryFailed ? (
          <button
            className="btn-pink w-full"
            onClick={() => setReload((value) => value + 1)}
          >
            {text("Reintentar recuperación", "Retry recovery")}
          </button>
        ) : done ? (
          <button
            className="btn-pink w-full"
            onClick={() => navigate("/dashboard")}
          >
            {text("Ir a mi cuenta", "Go to my account")}
          </button>
        ) : (
          <>
            {step === 0 && (
              <>
                <p>{welcome}</p>
                <p className="text-sm text-muted-foreground">
                  {text(
                    "Esta es una prueba: los fondos no son dinero real.",
                    "This is a test: funds are not real money.",
                  )}
                </p>
                <button
                  className="min-h-11 text-primary"
                  onClick={() => (isSpeaking ? stop() : speak(welcome))}
                >
                  {isSpeaking
                    ? text("Detener audio", "Stop audio")
                    : text("Escuchar bienvenida", "Listen to welcome")}
                </button>
                <button className="btn-pink w-full" onClick={() => setStep(1)}>
                  {text("Empezar", "Start")}
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <label htmlFor="onboarding-name" className="block">
                  {text("Tu nombre", "Your name")}
                </label>
                <input
                  id="onboarding-name"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-12 bg-card border border-border p-3"
                />
                <fieldset>
                  <legend className="mb-3">
                    {text(
                      "¿Cómo te describes?",
                      "How do you describe yourself?",
                    )}
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profiles.map((p) => (
                      <div
                        key={p.key}
                        className="border border-border p-3 space-y-2"
                      >
                        <button
                          className="min-h-12 w-full text-left"
                          aria-pressed={profileType === p.key}
                          onClick={() => {
                            setProfileType(p.key);
                            setPercentages(p.split);
                          }}
                        >
                          {profileType === p.key ? "✓ " : ""}
                          {p.label}
                        </button>
                        <button
                          aria-label={`${text("Escuchar descripción", "Listen to description")}: ${p.label}`}
                          className="min-h-11 text-primary text-sm"
                          onClick={() => speak(p.description)}
                        >
                          {text(
                            "Escuchar descripción",
                            "Listen to description",
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </fieldset>
                <button
                  disabled={!name.trim() || !profileType}
                  className="btn-pink w-full"
                  onClick={() => setStep(2)}
                >
                  {text("Siguiente", "Next")}
                </button>
              </>
            )}
            {step === 2 && (
              <ConnectModal embedded onConnected={() => setStep(3)} />
            )}
            {step === 3 && (
              <>
                <p>
                  {text(
                    "Cada espacio (o bóveda) reserva una parte para tus gastos o metas. Al cambiar una barra, las otras se ajustan para sumar 100%.",
                    "Each space (or vault) reserves a share for expenses or goals. Changing one slider adjusts the others to total 100%.",
                  )}
                </p>
                <fieldset
                  disabled={busy || !!txHash || !!journal?.transaction}
                  className="space-y-4"
                >
                  <legend className="sr-only">
                    {text("Nombres y porcentajes", "Names and percentages")}
                  </legend>
                  {names.map((value, i) => (
                    <div key={i}>
                      <label
                        htmlFor={`vault-${i}`}
                        className="block text-sm mb-1"
                      >
                        {text("Espacio", "Space")} {i + 1}
                      </label>
                      <input
                        id={`vault-${i}`}
                        value={value}
                        onChange={(e) => {
                          const next = [...names];
                          next[i] = e.target.value;
                          setVaultNames(next);
                        }}
                        className="min-h-12 w-full bg-card border border-border p-3"
                      />
                    </div>
                  ))}
                  <PercentageSlider
                    values={percentages}
                    labels={names}
                    colors={["pink", "mint", "pink-soft"]}
                    onChange={setPercentages}
                  />
                </fieldset>
                {isCustodial && !txHash && !journal?.transaction && (
                  <>
                    <PinInput
                      label={text(
                        "Autoriza el reparto con tu PIN",
                        "Authorize the split with your PIN",
                      )}
                      value={pin}
                      onChange={setPin}
                      description={pinHelp}
                      disabled={busy}
                    />
                    <button
                      className="min-h-11 text-primary"
                      onClick={() => speak(pinHelp)}
                    >
                      {text(
                        "Escuchar instrucciones del PIN",
                        "Listen to PIN instructions",
                      )}
                    </button>
                  </>
                )}
                {busy && (
                  <p role="status">
                    {txHash
                      ? text("Guardando tu perfil…", "Saving your profile…")
                      : text(
                          "Preparando y confirmando tu reparto. Espera un momento…",
                          "Preparing and confirming your split. Please wait…",
                        )}
                  </p>
                )}
                <button
                  className="btn-pink w-full"
                  disabled={
                    busy ||
                    (!txHash &&
                      !journal?.transaction &&
                      isCustodial &&
                      pin.length !== 4) ||
                    names.some((n) => !n.trim())
                  }
                  onClick={deploy}
                >
                  {busy
                    ? text("Guardando…", "Saving…")
                    : journal?.transaction && !txHash
                      ? text("Comprobar y continuar", "Check and continue")
                      : error
                        ? text("Reintentar", "Retry")
                        : text("Guardar mi reparto", "Save my split")}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
