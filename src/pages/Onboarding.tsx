import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PercentageSlider from "@/components/PercentageSlider";
import TerminalBlock from "@/components/TerminalBlock";

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
  const navigate = useNavigate();

  const handleProfileSelect = (key: string) => {
    setProfileType(key);
    const found = profileTypes.find((p) => p.key === key);
    if (found) setPercentages(found.split);
  };

  const handleDeploy = () => {
    setDeploying(true);
    setTimeout(() => {
      navigate("/dashboard");
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-sm transition-colors"
              style={{ backgroundColor: s <= step ? "#ffb3c6" : "#2e2729" }}
            />
          ))}
        </div>

        {/* Step 0 */}
        {step === 0 && (
          <div>
            <span className="font-mono text-xs text-dimmed tracking-widest">PASO 1 DE 3</span>
            <h1 className="text-3xl md:text-4xl font-bold mt-2 mb-4">
              <span className="text-foreground">EMPIEZA A</span>{" "}
              <span className="text-pink">PROTEGER TU DINERO</span>
            </h1>
            <p className="text-body-muted text-sm mb-8 leading-relaxed">
              Propulsor separa tu dinero automáticamente en bóvedas inteligentes. Sin banco. Sin permiso. Solo tú y tu código.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setStep(1)}
                className="btn-pink w-full rounded-sm text-center"
              >
                Crear cuenta nueva
              </button>
              <button
                onClick={() => {}}
                className="btn-outline-pink w-full rounded-sm text-center"
              >
                Tengo wallet Stellar
              </button>
            </div>

            <p className="text-dimmed text-xs font-mono mt-4 text-center">
              La integración con wallets Stellar estará disponible próximamente.
            </p>
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <span className="font-mono text-xs text-dimmed tracking-widest">PASO 2 DE 3</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">
              <span className="text-foreground">CONFIGURA TU </span>
              <span className="text-pink">PERFIL</span>
            </h1>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
                  Tu nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-card-dark border border-pink-subtle rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:border-pink-visible"
                  placeholder="¿Cómo te llamas?"
                />
              </div>

              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-3">
                  ¿Cómo te describes?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {profileTypes.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => handleProfileSelect(p.key)}
                      className={`p-4 rounded-sm border text-left transition-colors ${
                        profileType === p.key
                          ? "border-pink-visible bg-card-dark"
                          : "border-pink-subtle hover:bg-hover-dark"
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

        {/* Step 2 */}
        {step === 2 && !deploying && (
          <div>
            <span className="font-mono text-xs text-dimmed tracking-widest">PASO 3 DE 3</span>
            <h1 className="text-3xl font-bold mt-2 mb-6">
              <span className="text-foreground">DEFINE TUS </span>
              <span className="text-pink">BÓVEDAS</span>
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
                    className="flex-1 bg-card-dark border border-pink-subtle rounded-sm px-3 py-2 text-foreground text-sm focus:outline-none focus:border-pink-visible"
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

        {/* Deploying */}
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
                { text: "→ Tx: GBPROPULSOR...XF9A ✓", color: "mint" },
              ]}
            />
            <p className="text-body-muted text-sm mt-6">Preparando tu espacio...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
