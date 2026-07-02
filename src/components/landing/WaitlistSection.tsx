import { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const checklistColors = ["pink", "mint", "pink", "mint", "pink"];

const WaitlistSection = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const checklistItems = t.waitlist.checklist.map((text, i) => ({ text, color: checklistColors[i] }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <section id="waitlist" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">{t.waitlist.eyebrow}</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">{t.waitlist.titlePart1}</span>
          <span className="text-pink">{t.waitlist.titlePart2}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          {!submitted ? (
            <form onSubmit={handleSubmit} className="bg-card-dark p-6 rounded-sm border border-pink-subtle">
              <label className="block text-sm text-foreground mb-2 font-semibold uppercase tracking-wider">
                {t.waitlist.emailLabel}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.waitlist.emailPlaceholder}
                required
                className="w-full bg-deep border border-pink-subtle rounded-sm px-4 py-3 text-foreground text-sm font-mono placeholder:text-dimmed focus:outline-none focus:border-pink-visible"
              />
              <button type="submit" className="btn-pink rounded-sm w-full mt-4">
                {t.waitlist.submit}
              </button>
              <p className="text-dimmed text-xs mt-3">
                {t.waitlist.helper}
              </p>
            </form>
          ) : (
            <div className="bg-card-dark p-6 rounded-sm border border-pink-subtle text-center">
              <span className="text-4xl mb-4 block">✓</span>
              <h3 className="text-xl font-bold text-mint mb-2">{t.waitlist.successTitle}</h3>
              <p className="text-body-muted text-sm">
                {t.waitlist.successBody}
              </p>
            </div>
          )}
        </motion.div>

        {/* Checklist */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="space-y-4"
        >
          {checklistItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold"
                style={{
                  color: item.color === "pink" ? "#ffb3c6" : "#b8f0c8",
                  border: `1px solid ${item.color === "pink" ? "rgba(255,179,198,0.3)" : "rgba(184,240,200,0.3)"}`,
                }}
              >
                ✓
              </span>
              <span className="text-foreground text-sm">{item.text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default WaitlistSection;
