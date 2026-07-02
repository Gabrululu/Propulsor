import { motion } from "framer-motion";
import FlowNode from "../FlowNode";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const flowColors = ["pink", "mint", "pink", "mint", "pink"] as const;

const LatamSection = () => {
  const { t } = useLanguage();
  const flowSteps = t.latam.flowSteps.map((label, i) => ({ label, color: flowColors[i] }));

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.latam.sectionLabel}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.latam.titlePart1}</span>
          <span className="text-pink">{t.latam.titlePart2}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <span className="font-mono text-6xl md:text-8xl font-bold text-pink">{t.latam.amount}</span>
          <p className="text-body-muted text-sm mt-4 leading-relaxed max-w-md">
            {t.latam.description}
          </p>
          <a href="#waitlist" className="btn-pink rounded-sm inline-block mt-6">
            {t.latam.cta}
          </a>
        </motion.div>

        {/* Right — Flow */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center gap-2"
        >
          {flowSteps.map((step, i) => (
            <div key={i} className="flex flex-col items-center">
              <FlowNode label={step.label} color={step.color} size={36} />
              {i < flowSteps.length - 1 && (
                <div className="w-px h-8 bg-pink-subtle" style={{ background: "rgba(255,179,198,0.15)" }} />
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default LatamSection;
