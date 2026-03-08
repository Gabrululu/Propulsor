import { motion } from "framer-motion";

const ManifestoSection = () => {
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
          <span className="text-dimmed">EL SISTEMA NO FUE</span>{" "}
          <span className="text-dimmed">DISEÑADO PARA ELLAS.</span>
          <br />
          <span className="text-pink">PROPULSOR SÍ.</span>
          <br />
          <br />
          <span className="text-dimmed">NO INTENTAS AHORRAR.</span>
          <br />
          <span className="text-mint">EL CÓDIGO CUIDA TU DINERO.</span>
        </h2>
      </motion.div>
    </section>
  );
};

export default ManifestoSection;
