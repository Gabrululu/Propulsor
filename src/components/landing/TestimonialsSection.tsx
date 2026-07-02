import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const itemColors = ["pink", "mint", "pink"] as const;

const borderColor = {
  pink: "rgba(255,179,198,0.25)",
  mint: "rgba(184,240,200,0.25)",
};
const glowBg = {
  pink: "rgba(255,179,198,0.06)",
  mint: "rgba(184,240,200,0.06)",
};

const TestimonialsSection = () => {
  const { t } = useLanguage();
  const testimonials = t.testimonials.items.map((item, i) => ({ ...item, color: itemColors[i] }));

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.testimonials.sectionLabel}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.testimonials.titlePart1}</span>
          <span className="text-pink">{t.testimonials.titlePart2}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="bg-card-dark p-6 rounded-sm"
          >
            <p className="text-foreground text-sm italic leading-relaxed mb-6">
              "{item.quote.split(item.highlight)[0]}
              <strong className="text-pink-soft not-italic">{item.highlight}</strong>
              {item.quote.split(item.highlight)[1]}"
            </p>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-sm flex items-center justify-center font-bold text-sm"
                style={{
                  border: `1px solid ${borderColor[item.color]}`,
                  background: glowBg[item.color],
                  color: item.color === "pink" ? "#ffb3c6" : "#b8f0c8",
                }}
              >
                {item.name[0]}
              </div>
              <div>
                <p className="text-foreground text-sm font-semibold">{item.name}</p>
                <p className="text-dimmed text-xs">{item.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default TestimonialsSection;
