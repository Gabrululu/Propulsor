import { motion } from "framer-motion";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-overlay" />

      {/* Glow blobs */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,179,198,0.07) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(184,240,200,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Diamond pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]">
        <svg width="100%" height="100%">
          <pattern id="diamonds" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            <rect
              x="35"
              y="5"
              width="10"
              height="10"
              transform="rotate(45 40 10)"
              fill="none"
              stroke="#ffb3c6"
              strokeWidth="0.5"
            />
            <rect
              x="35"
              y="45"
              width="10"
              height="10"
              transform="rotate(45 40 50)"
              fill="none"
              stroke="#b8f0c8"
              strokeWidth="0.5"
            />
          </pattern>
          <rect width="100%" height="100%" fill="url(#diamonds)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 w-full">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-mono text-xs text-body-muted tracking-widest mb-8"
        >
          Independencia financiera · Stellar Network · x402 · LATAM
        </motion.p>

        {/* Main headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] mb-12">
            <span className="block text-foreground">TU PRIMERA</span>
            <span className="block text-outline">HERRAMIENTA DE</span>
            <span className="block text-pink">INDEPENDENCIA.</span>
          </h1>
        </motion.div>

        {/* Bottom row */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end border-t border-pink-subtle pt-8"
        >
          {/* Description */}
          <div className="md:col-span-3">
            <p className="text-body-muted text-sm leading-relaxed">
              Separa, protege y ahorra tu dinero automáticamente con bóvedas inteligentes en Stellar. Sin banco. Sin
              permiso. Solo tú.
            </p>
          </div>

          {/* Stats */}
          <div className="md:col-span-6 grid grid-cols-3 gap-6">
            <div>
              <span className="font-mono text-2xl md:text-3xl font-bold text-pink">7 de 10</span>
              <p className="text-body-muted text-xs mt-1">mujeres en Perú sin cuenta bancaria propia</p>
            </div>
            <div>
              <span className="font-mono text-2xl md:text-3xl font-bold text-mint">$0.00001</span>
              <p className="text-body-muted text-xs mt-1">Fee por transacción en Stellar</p>
            </div>
            <div>
              <span className="font-mono text-2xl md:text-3xl font-bold text-pink">5s</span>
              <p className="text-body-muted text-xs mt-1">Para separar y proteger tu dinero</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <a href="#waitlist" className="btn-pink rounded-sm text-center">
              → Quiero acceso anticipado
            </a>
            <a href="#problem" className="btn-outline-pink rounded-sm text-center">
              Ver el problema
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
