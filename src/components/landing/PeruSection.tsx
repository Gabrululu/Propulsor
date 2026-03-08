import { motion } from "framer-motion";
import FlowNode from "../FlowNode";

const flowSteps = [
  { label: "Recibes S/", color: "pink" as const },
  { label: "Anchor SEP-24\nconvierte", color: "mint" as const },
  { label: "Soroban\nejecuta", color: "pink" as const },
  { label: "Retiras\nUSDC", color: "mint" as const },
  { label: "3 bóvedas\nactivas", color: "pink" as const },
];

const PeruSection = () => {
  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">// SECCIÓN 04</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">HECHO PARA </span>
          <span className="text-pink">PERÚ</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          <span className="font-mono text-6xl md:text-8xl font-bold text-pink">S/1000</span>
          <p className="text-body-muted text-sm mt-4 leading-relaxed max-w-md">
            Depositas mil soles. En 5 segundos, un anchor convierte a USDC y Soroban los separa en
            tus 3 bóvedas. Sin banco. Sin espera. Sin permiso.
          </p>
          <a href="#waitlist" className="btn-pink rounded-sm inline-block mt-6">
            → Quiero acceso anticipado
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

export default PeruSection;
