import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PercentageSlider from "@/components/PercentageSlider";
import SplitBar from "@/components/SplitBar";
import TerminalBlock from "@/components/TerminalBlock";
import SoundWaveBars from "@/components/voice/SoundWaveBars";
import { useVoice } from "@/hooks/useVoice";
import { buildSimulatorSummary } from "@/lib/voiceMessages";
import { useStellarFees } from "@/hooks/useStellarFees";

const RATE = 3.71; // PEN to USD
const BANK_MONTHLY_FEE = 15; // S/15.00/mes average bank fee

const Simulate = () => {
  const [amountPEN, setAmountPEN] = useState("1000");
  const [percentages, setPercentages] = useState([60, 30, 10]);
  const [vaultNames] = useState(["Hogar", "Fondo seguro", "Meta grande"]);
  const [locks, setLocks] = useState([false, false, true]);
  const { speak, stop, isSpeaking } = useVoice();
  const hasListened = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fees = useStellarFees();

  const pen = parseFloat(amountPEN) || 0;
  const usdc = pen / RATE;
  const splits = percentages.map((p) => (usdc * p) / 100);

  // Annual savings compared to bank
  const annualSavings = BANK_MONTHLY_FEE * 12;

  // Debounced auto-speak
  useEffect(() => {
    if (!hasListened.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const msg = buildSimulatorSummary(pen, vaultNames, percentages);
      speak(msg);
    }, 1200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [pen, percentages, vaultNames, speak]);

  const handleListenClick = useCallback(() => {
    if (isSpeaking) { stop(); return; }
    hasListened.current = true;
    const msg = buildSimulatorSummary(pen, vaultNames, percentages);
    speak(msg);
  }, [isSpeaking, stop, pen, vaultNames, percentages, speak]);

  const feeDisplay = fees.loading
    ? "$0.00001 USD (cargando...)"
    : `$${fees.feeUSD.toFixed(6)} USD (${fees.baseFeeStroops} stroops)`;

  const terminalLines = [
    { text: "// propulsor::simulate", color: "dimmed" as const },
    { text: `input: ${pen.toFixed(2)} PEN`, color: "default" as const },
    { text: `convert: ${pen.toFixed(2)} / ${RATE} = ${usdc.toFixed(2)} USDC`, color: "pink" as const },
    { text: "", color: "default" as const },
    ...vaultNames.map((name, i) => ({
      text: `vault::${name.toLowerCase().replace(" ", "_")} → $${splits[i].toFixed(2)} USDC (${percentages[i]}%)${locks[i] ? " 🔒" : ""}`,
      color: (i === 1 ? "mint" : "pink") as "mint" | "pink",
    })),
    { text: "", color: "default" as const },
    { text: `→ Fee estimado: ${feeDisplay}`, color: "mint" as const },
    { text: `→ Tx: GBSIMULADOR...XF9A ✓`, color: "mint" as const },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-14">
        <section className="py-24 px-6 max-w-5xl mx-auto">
          <span className="font-mono text-xs text-dimmed tracking-widest">SIMULADOR</span>
          <h1 className="text-3xl md:text-5xl font-bold mt-2 mb-2">
            <span className="text-foreground">SIMULA TU </span>
            <span className="text-pink">SEPARACIÓN</span>
          </h1>
          <p className="text-body-muted text-sm mb-12 max-w-lg">
            Ingresa un monto en soles y mira cómo se distribuiría automáticamente en tus bóvedas.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left — inputs */}
            <div className="space-y-8">
              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-2">
                  Monto en Soles (PEN)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pink font-mono text-lg">S/</span>
                  <input
                    type="number"
                    value={amountPEN}
                    onChange={(e) => setAmountPEN(e.target.value)}
                    className="w-full bg-card-dark border border-pink-subtle rounded-sm pl-12 pr-4 py-4 text-foreground text-2xl font-mono focus:outline-none focus:border-pink-visible"
                    placeholder="1000"
                    min={0}
                  />
                </div>
                <p className="text-dimmed text-xs font-mono mt-2">
                  ≈ ${usdc.toFixed(2)} USDC (1 USD = S/{RATE})
                </p>
              </div>

              <div>
                <label className="block text-sm text-foreground font-semibold uppercase tracking-wider mb-4">
                  Distribución
                </label>
                <PercentageSlider
                  values={percentages}
                  labels={vaultNames.map((n, i) => `${["🏠", "🔒", "🚀"][i]} ${n}`)}
                  colors={["pink", "mint", "pink-soft"]}
                  onChange={setPercentages}
                />
              </div>

              <div className="space-y-3">
                {vaultNames.map((name, i) => (
                  <div key={i} className="flex items-center justify-between bg-card-dark p-3 rounded-sm border border-pink-subtle">
                    <span className="text-sm text-foreground">{name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-pink">${splits[i].toFixed(2)}</span>
                      <button
                        onClick={() => {
                          const next = [...locks];
                          next[i] = !next[i];
                          setLocks(next);
                        }}
                        className={`text-xs font-mono px-2 py-1 rounded-sm border transition-colors ${
                          locks[i]
                            ? "text-pink border-pink-visible bg-deep"
                            : "text-dimmed border-pink-subtle"
                        }`}
                      >
                        {locks[i] ? "🔒 Lock" : "Libre"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {percentages.reduce((a, b) => a + b, 0) !== 100 && (
                <p className="text-pink text-xs font-mono">
                  ⚠ Los porcentajes deben sumar 100%
                </p>
              )}
            </div>

            {/* Right — output */}
            <div className="space-y-6">
              <SplitBar
                segments={percentages.map((p, i) => ({
                  percentage: p,
                  color: (["pink", "mint", "pink-soft"] as const)[i],
                  label: vaultNames[i],
                }))}
                height={12}
              />

              <div className="space-y-3">
                {vaultNames.map((name, i) => (
                  <div
                    key={i}
                    className="bg-card-dark p-4 rounded-sm flex items-center justify-between"
                    style={{
                      borderLeft: `3px solid ${
                        ["rgba(255,179,198,0.3)", "rgba(184,240,200,0.3)", "rgba(232,160,180,0.3)"][i]
                      }`,
                    }}
                  >
                    <div>
                      <span className="text-foreground text-sm font-semibold">{["🏠", "🔒", "🚀"][i]} {name}</span>
                      <span className="text-body-muted text-xs ml-2">({percentages[i]}%)</span>
                    </div>
                    <span className="font-mono text-lg font-bold" style={{ color: ["#ffb3c6", "#b8f0c8", "#e8a0b4"][i] }}>
                      ${splits[i].toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Fee comparison */}
              <div className="bg-card-dark border border-pink-subtle rounded-sm p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-body-muted font-mono">Fee Stellar</span>
                  <span className="text-xs text-mint font-mono font-bold">
                    {fees.loading ? "..." : `$${fees.feeUSD.toFixed(6)} USD`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-body-muted font-mono">Comisión bancaria promedio</span>
                  <span className="text-xs text-pink-soft font-mono">S/15.00/mes</span>
                </div>
                <div className="border-t border-pink-subtle pt-2 flex justify-between items-center">
                  <span className="text-xs text-foreground font-mono font-semibold">Ahorro anual estimado</span>
                  <span className="text-sm text-pink font-mono font-bold">S/{annualSavings.toFixed(2)}</span>
                </div>
              </div>

              <TerminalBlock lines={terminalLines} title="soroban :: simulate.rs" />

              {/* Voice summary button */}
              <button
                onClick={handleListenClick}
                className="w-full p-3 rounded-sm border transition-colors flex items-center justify-center gap-3 bg-card-dark"
                style={{
                  borderColor: isSpeaking ? "rgba(255,179,198,0.4)" : "rgba(255,179,198,0.18)",
                }}
              >
                <SoundWaveBars isActive={isSpeaking} />
                <span className="font-mono text-[0.7rem] uppercase tracking-wider text-pink">
                  {isSpeaking ? "⏹ DETENER" : "🔊 ESCUCHAR RESUMEN"}
                </span>
              </button>

              <Link to="/dashboard" className="btn-pink rounded-sm block text-center mt-2">
                Crear mi cuenta y activar esto →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Simulate;
