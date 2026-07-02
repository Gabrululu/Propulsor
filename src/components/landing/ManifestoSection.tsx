import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const ManifestoSection = () => {
  const { t } = useLanguage();

  return (
    <section className="py-32 px-6">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="max-w-4xl mx-auto text-center"
      >
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight">
          <span className="text-dimmed">{t.manifesto.line1}</span>{" "}
          <span className="text-dimmed">{t.manifesto.line2}</span>
          <br />
          <span className="text-pink">{t.manifesto.line3}</span>
          <br />
          <br />
          <span className="text-dimmed">{t.manifesto.line4}</span>
          <br />
          <span className="text-mint">{t.manifesto.line5}</span>
        </h2>
      </motion.div>
    </section>
  );
};

export default ManifestoSection;
