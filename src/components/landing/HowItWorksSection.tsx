import { motion } from "framer-motion";

const steps = [
  {
    index: "01",
    title: "Recibe tu dinero",
    tag: "ANCHOR",
    tagColor: "pink" as const,
    description: "Deposita soles. Un anchor SEP-24 convierte tu dinero a USDC en Stellar automáticamente.",
  },
  {
    index: "02",
    title: "Separa automáticamente",
    tag: "SOROBAN",
    tagColor: "mint" as const,
    description: "Un smart contract ejecuta tu regla de separación: cada sol se divide entre tus bóvedas.",
  },
  {
    index: "03",
    title: "Protege y ahorra",
    tag: "VAULTS",
    tagColor: "pink" as const,
    description: "Tus bóvedas guardan, bloquean o acumulan tu dinero según tus reglas. Sin intermediarios.",
  },
];

const tagBg = {
  pink: "rgba(255,179,198,0.1)",
  mint: "rgba(184,240,200,0.1)",
};
const tagText = {
  pink: "text-pink",
  mint: "text-mint",
};

const HowItWorksSection = () => {
  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">// SECCIÓN 01</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">CÓMO </span>
          <span className="text-pink">FUNCIONA</span>
        </h2>
      </div>

      <div className="border-t border-pink-subtle">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="grid grid-cols-12 gap-4 items-center py-6 border-b border-pink-subtle hover:bg-hover-dark transition-colors px-4"
          >
            <div className="col-span-2 md:col-span-1">
              <span className="font-mono text-2xl text-dimmed">{step.index}</span>
            </div>
            <div className="col-span-5 md:col-span-4 flex items-center gap-3">
              <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
              <span
                className={`font-mono text-[10px] px-2 py-0.5 rounded-sm ${tagText[step.tagColor]}`}
                style={{ background: tagBg[step.tagColor] }}
              >
                {step.tag}
              </span>
            </div>
            <div className="col-span-5 md:col-span-7">
              <p className="text-body-muted text-sm">{step.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default HowItWorksSection;
