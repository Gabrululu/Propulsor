const Footer = () => {
  return (
    <footer className="border-t border-pink-subtle py-12 px-6 bg-deep">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <span className="text-pink font-bold text-lg">PROPULSOR</span>
          <p className="text-dimmed text-xs mt-2 leading-relaxed">
            Tu primera herramienta de independencia financiera.
            Construida en Stellar Network.
          </p>
        </div>
        <div>
          <span className="font-mono text-xs text-body-muted uppercase tracking-widest">Tecnología</span>
          <div className="mt-3 space-y-1">
            <p className="text-dimmed text-xs font-mono">Stellar Network</p>
            <p className="text-dimmed text-xs font-mono">Soroban Smart Contracts</p>
            <p className="text-dimmed text-xs font-mono">SEP-24 Anchors</p>
            <p className="text-dimmed text-xs font-mono">USDC Stablecoin</p>
          </div>
        </div>
        <div>
          <span className="font-mono text-xs text-body-muted uppercase tracking-widest">She Ships 2026</span>
          <p className="text-dimmed text-xs mt-3 leading-relaxed">
            Proyecto presentado en She Ships 2026 — el hackathon global para soluciones fintech lideradas por mujeres.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-pink-subtle flex flex-col sm:flex-row justify-between items-center gap-4">
        <span className="text-dimmed text-xs font-mono">© 2026 Propulsor. Todos los derechos reservados.</span>
        <span className="text-dimmed text-xs font-mono">Stellar · Soroban · USDC · Perú 🇵🇪</span>
      </div>
    </footer>
  );
};

export default Footer;
