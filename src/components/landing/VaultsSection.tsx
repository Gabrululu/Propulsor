import { motion } from "framer-motion";
import TerminalBlock from "../TerminalBlock";

const vaults = [
  { icon: "🏠", name: "Hogar", pct: 60, color: "pink" as const, desc: "Gastos del día a día, comida, servicios" },
  { icon: "🔒", name: "Fondo seguro", pct: 30, color: "mint" as const, desc: "Emergencias, salud, imprevistos" },
  { icon: "🚀", name: "Meta grande", pct: 10, color: "pink-soft" as const, desc: "Tu sueño: negocio, casa, educación" },
];

const colorBorder = {
  pink: "rgba(255,179,198,0.2)",
  mint: "rgba(184,240,200,0.2)",
  "pink-soft": "rgba(232,160,180,0.2)",
};
const colorText = {
  pink: "text-pink",
  mint: "text-mint",
  "pink-soft": "text-pink-soft",
};
const colorBg = {
  pink: "#ffb3c6",
  mint: "#b8f0c8",
  "pink-soft": "#e8a0b4",
};

const terminalLines = [
  { text: "// propulsor::split_engine", color: "dimmed" as const },
  { text: 'fn execute_split(amount: u128) {', color: "pink" as const },
  { text: "  let hogar = amount * 60 / 100;", color: "default" as const },
  { text: "  let seguro = amount * 30 / 100;", color: "default" as const },
  { text: "  let meta = amount * 10 / 100;", color: "default" as const },
  { text: '  vault::deposit("hogar", hogar);', color: "pink" as const },
  { text: '  vault::deposit("seguro", seguro);', color: "pink" as const },
  { text: '  vault::deposit("meta", meta);', color: "pink" as const },
  { text: "}", color: "default" as const },
  { text: "", color: "default" as const },
  { text: "→ Split ejecutado: 3 bóvedas activas", color: "mint" as const },
  { text: "→ Tx: GBPROPULSOR...XF9A ✓", color: "mint" as const },
];

const VaultsSection = () => {
  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">// SECCIÓN 02</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">TUS </span>
          <span className="text-pink">BÓVEDAS</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Vault cards */}
        <div className="space-y-4">
          {vaults.map((v, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-card-dark p-5 rounded-sm flex items-center gap-4"
              style={{ borderLeft: `3px solid ${colorBorder[v.color]}` }}
            >
              <span className="text-3xl">{v.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className={`font-bold uppercase text-sm ${colorText[v.color]}`}>{v.name}</h3>
                  <span className="font-mono text-sm" style={{ color: colorBg[v.color] }}>{v.pct}%</span>
                </div>
                <p className="text-body-muted text-xs mt-1">{v.desc}</p>
                {/* Mini bar */}
                <div className="w-full h-1.5 bg-deep rounded-sm mt-3 overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{ width: `${v.pct}%`, backgroundColor: colorBg[v.color] }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Terminal */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <TerminalBlock lines={terminalLines} title="soroban :: split_contract.rs" />
        </motion.div>
      </div>
    </section>
  );
};

export default VaultsSection;
