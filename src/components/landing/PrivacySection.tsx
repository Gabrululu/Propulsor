import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const pointColors = ["pink", "mint", "pink-soft"] as const;

const borderColors = {
  pink: "rgba(255,179,198,0.3)",
  mint: "rgba(184,240,200,0.3)",
  "pink-soft": "rgba(232,160,180,0.3)",
};

const PrivacySection = () => {
  const { t } = useLanguage();
  const privacyPoints = t.privacy.points.map((p, i) => ({ ...p, color: pointColors[i] }));

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.privacy.sectionLabel}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.privacy.titlePart1}</span>
          <span className="text-mint">{t.privacy.titlePart2}</span>
        </h2>
        <p className="text-body-muted text-sm mt-4 max-w-2xl leading-relaxed">
          {t.privacy.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {privacyPoints.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bg-card-dark p-6 rounded-sm border-l-2"
            style={{ borderColor: borderColors[p.color] }}
          >
            <span className="text-2xl block mb-3">{p.icon}</span>
            <h3 className="text-foreground text-sm font-bold uppercase tracking-wide mb-2">{p.title}</h3>
            <p className="text-body-muted text-xs leading-relaxed">{p.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default PrivacySection;
