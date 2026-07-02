import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const cardColors = ["pink", "mint", "pink-soft"] as const;

const borderColors = {
  pink: "rgba(255,179,198,0.3)",
  mint: "rgba(184,240,200,0.3)",
  "pink-soft": "rgba(232,160,180,0.3)",
};

const textColors = {
  pink: "text-pink",
  mint: "text-mint",
  "pink-soft": "text-pink-soft",
};

const ProblemSection = () => {
  const { t } = useLanguage();
  const problemCards = t.problem.cards.map((card, i) => ({ ...card, color: cardColors[i] }));

  return (
    <section id="problem" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.problem.sectionLabel}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.problem.titlePart1}</span>
          <span className="text-pink">{t.problem.titlePart2}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {problemCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="bg-card-dark p-6 rounded-sm"
            style={{ borderBottom: `2px solid ${borderColors[card.color]}` }}
          >
            <span className={`font-mono text-4xl font-bold ${textColors[card.color]}`}>
              {card.value}
            </span>
            <p className="text-body-muted text-sm mt-3 leading-relaxed">{card.label}</p>
            <p className="text-dimmed text-xs font-mono mt-4">{card.source}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default ProblemSection;
