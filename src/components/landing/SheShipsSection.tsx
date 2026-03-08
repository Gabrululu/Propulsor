import { motion } from "framer-motion";

const SheShipsSection = () => {
  return (
    <section className="py-16 px-6 bg-deep border-y border-pink-subtle">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="font-mono text-xs text-dimmed tracking-widest">SHE SHIPS 2026</span>
          <h2 className="text-3xl md:text-4xl font-bold mt-2 text-foreground">
            CONSTRUIDA PARA{" "}
            <span className="text-pink">CERRAR LA BRECHA</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-card-dark p-5 rounded-sm border-l-2"
            style={{ borderColor: "rgba(255,179,198,0.3)" }}
          >
            <span className="font-mono text-[10px] text-pink tracking-widest">CATEGORÍA</span>
            <p className="text-foreground text-sm mt-2 font-semibold leading-snug">
              Best Fintech Solution for Women's Economic Empowerment
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-card-dark p-5 rounded-sm border-l-2"
            style={{ borderColor: "rgba(184,240,200,0.3)" }}
          >
            <span className="font-mono text-[10px] text-mint tracking-widest">CATEGORÍA</span>
            <p className="text-foreground text-sm mt-2 font-semibold leading-snug">
              Best Financial Inclusion Solution for Women
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SheShipsSection;
