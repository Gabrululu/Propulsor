import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PercentageSlider from "@/components/PercentageSlider";
import TerminalBlock from "@/components/TerminalBlock";
import SpeakerButton from "@/components/voice/SpeakerButton";
import SoundWaveBars from "@/components/voice/SoundWaveBars";
import ConnectModal from "@/components/stellar/ConnectModal";
import { useVoice } from "@/hooks/useVoice";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ONBOARDING_WELCOME,
  PROFILE_DESCRIPTIONS,
  buildSplitConfirmation,
} from "@/lib/voiceMessages";

const profileTypes = [
  { key: "jefa_hogar", icon: "🏠", label: "Jefa de hogar", split: [60, 30, 10] },
  { key: "emprendedora", icon: "🛍️", label: "Emprendedora", split: [40, 30, 30] },
  { key: "trabajadora", icon: "💼", label: "Trabajadora dependiente", split: [50, 35, 15] },
  { key: "freelancer", icon: "💻", label: "Freelancer", split: [45, 30, 25] },
];

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [profileType, setProfileType] = useState("");
  const [percentages, setPercentages] = useState([60, 30, 10]);
  const [vaultNames, setVaultNames] = useState(["Hogar", "Fondo seguro", "Meta grande"]);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);
  const [stellarPublicKey, setStellarPublicKey] = useState("");
  const navigate = useNavigate();
  const { speak, stop, isSpeaking } = useVoice();
  const { user } = useAuth();
  const welcomePlayed = useRef(false);

  const totalSteps = 4;

  useEffect(() => {
    if (step === 0 && !welcomePlayed.current) {
      welcomePlayed.current = true;
      const timer = setTimeout(() => speak(ONBOARDING_WELCOME), 600);
      return () => clearTimeout(timer);
    }
  }, [step, speak]);

  const handleProfileSelect = (key: string) => {
    setProfileType(key);
    const found = profileTypes.find((p) => p.key === key);
    if (found) setPercentages(found.split);
  };

  const handleProfileHover = (key: string) => {
    const desc = PROFILE_DESCRIPTIONS[key];
    if (desc) speak(desc);
  };

  const handleWalletConnected = (mode: "custodial" | "external", publicKey: string) => {
    setStellarPublicKey(publicKey);
    setTimeout(() => setStep(3), 800);
  };

  const handleDeploy = async () => {
    setDeploying(true);

    // Save profile to Supabase
    if (user) {
      const profileData: Record<string, any> = {
        id: user.id,
        name: name.trim(),
        profile_type: profileType as any,
        onboarding_complete: true,
      };

      // Only set stellar_public_key if we have it (custodial already saved it, but external needs it)
      if (stellarPublicKey) {
        profileData.stellar_public_key = stellarPublicKey;
      }

      const { error } = await supabase
        .from("users_profile")
        .upsert(profileData, { onConflict: "id" });

      if (error) {
        console.error("Failed to save profile:", error.message);
      }
    }

    setTimeout(() => {
      setDeployDone(true);
      const msg = buildSplitConfirmation(vaultNames, percentages);
      setTimeout(() => speak(msg), 600);
      setTimeout(() => navigate("/dashboard"), 4000);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, s) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-sm transition-colors"
              style={{ backgroundColor: s <= step ? "hsl(var(--primary))" : "hsl(var(--background-hover))" }}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="relative">
            <div className="absolute top-0 right-0">
              <SpeakerButton
                isSpeaking={isSpeaking}
                onClick={() => { if (isSpeaking) stop(); else speak(ONBOARDING_WELCOME); }}
              />
            </div>
            <span className="font-mono text-xs text-muted-foreground tracking-widest">PASO 1 DE {totalSteps}</span>
            <h1 className="text-3xl md:text-4xl font-bold mt-2 mb-4">
              <span className="text-foreground">EMPIEZA A</span>{" "}
              <span className="text-primary">PROTEGER TU DINERO</span>
            </h1>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Propulsor separa tu dinero automáticamente en bóvedas inteligentes. Sin banco. Sin permiso. Solo tú y tu código.
            </p>
            <button onClick={() => setStep(1)} className="btn-pink w-full rounded-sm text-center">
              Empezar →
            </button>
          </div>
        )}

        {/* Step 1: Profile */}
        {step === 1 && (
          <div>
            <span className="font-mono text-xs text-muted-foreground tracking-widest">PASO 2 DE {totalSteps}</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">
              <span className="text-foreground">CONFIGURA TU </span>
              <span className="text-primary">PERFIL</span>
            </h1>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">Tu nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="¿Cómo te llamas?"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-3">¿Cómo te describes?</label>
                <div className="grid grid-cols-2 gap-3">
                  {profileTypes.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => handleProfileSelect(p.key)}
                      onMouseEnter={() => handleProfileHover(p.key)}
                      onTouchStart={() => handleProfileHover(p.key)}
                      className={`p-4 rounded-sm border text-left transition-colors ${
                        profileType === p.key ? "border-primary bg-card" : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="text-2xl block mb-1">{p.icon}</span>
                      <span className="text-sm text-foreground">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!name.trim() || !profileType}
              className="btn-pink w-full rounded-sm mt-6"
              style={{ opacity: !name.trim() || !profileType ? 0.4 : 1 }}
            >
              Siguiente →
            </button>
          </div>
        )}

        {/* Step 2: Connect Wallet */}
        {step === 2 && (
          <div>
            <span className="font-mono text-xs text-muted-foreground tracking-widest">PASO 3 DE {totalSteps}</span>
            <h1 className="text-2xl font-bold mt-2 mb-6">
              <span className="text-foreground">ELIGE CÓMO </span>
              <span className="text-primary">CONECTARTE</span>
            </h1>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              Puedes empezar sin wallet — nosotros creamos tu cuenta Stellar.
            </p>
            <ConnectModal embedded={true} onConnected={handleWalletConnected} />
          </div>
        )}

        {/* Step 3: Vaults */}
        {step === 3 && !deploying && (
          <div>
            <span className="font-mono text-xs text-muted-foreground tracking-widest">PASO 4 DE {totalSteps}</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">
              <span className="text-foreground">DEFINE TUS </span>
              <span className="text-primary">BÓVEDAS</span>
            </h1>
            <div className="space-y-4 mb-6">
              {vaultNames.map((vn, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl">{["🏠", "🔒", "🚀"][i]}</span>
                  <input
                    type="text"
                    value={vn}
                    onChange={(e) => {
                      const next = [...vaultNames];
                      next[i] = e.target.value;
                      setVaultNames(next);
                    }}
                    className="flex-1 bg-card border border-border rounded-sm px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
            <PercentageSlider
              values={percentages}
              labels={vaultNames}
              colors={["pink", "mint", "pink-soft"]}
              onChange={setPercentages}
            />
            <button onClick={handleDeploy} className="btn-pink w-full rounded-sm mt-8">
              Crear mis bóvedas →
            </button>
          </div>
        )}

        {/* Deploying / Success */}
        {deploying && (
          <div className="text-center">
            <TerminalBlock
              title="soroban :: deploy"
              lines={[
                { text: "Ejecutando en Soroban...", color: "pink" },
                { text: "Creando 3 bóvedas...", color: "default" },
                { text: `→ ${vaultNames[0]} (${percentages[0]}%)`, color: "pink" },
                { text: `→ ${vaultNames[1]} (${percentages[1]}%)`, color: "mint" },
                { text: `→ ${vaultNames[2]} (${percentages[2]}%)`, color: "pink" },
                { text: "", color: "default" },
                { text: "Desplegando contrato...", color: "default" },
                { text: `→ Tx: GBPROPULSOR...XF9A ✓`, color: "mint" },
              ]}
            />
            {deployDone && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <SoundWaveBars isActive={isSpeaking} />
                <p className="text-muted-foreground text-sm">Tu dinero ya está protegido.</p>
                <button
                  onClick={() => {
                    const msg = buildSplitConfirmation(vaultNames, percentages);
                    speak(msg);
                  }}
                  className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                >
                  🔊 Escuchar de nuevo
                </button>
              </div>
            )}
            {!deployDone && <p className="text-muted-foreground text-sm mt-6">Preparando tu espacio...</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
