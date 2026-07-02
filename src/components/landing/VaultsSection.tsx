import { motion } from "framer-motion";
import TerminalBlock from "../TerminalBlock";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const vaultMeta = [
  { pct: 60, color: "pink" as const },
  { pct: 30, color: "mint" as const },
  { pct: 10, color: "pink-soft" as const },
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

const lineColors = ["dimmed", "pink", "default", "default", "default", "pink", "pink", "pink", "default", "default", "mint", "mint", "default", "dimmed", "mint"] as const;

const VaultsSection = () => {
  const { t } = useLanguage();
  const vaults = t.vaults.items.map((v, i) => ({ ...v, ...vaultMeta[i] }));
  const terminalLines = t.vaults.terminalLines.map((text, i) => ({ text, color: lineColors[i] }));

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.vaults.sectionLabel}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.vaults.titlePart1}</span>
          <span className="text-pink">{t.vaults.titlePart2}</span>
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
          <TerminalBlock lines={terminalLines} title={t.vaults.terminalTitle} />
        </motion.div>
      </div>
    </section>
  );
};

export default VaultsSection;
