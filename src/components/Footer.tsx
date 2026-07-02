import { useLanguage } from "@/lib/i18n/LanguageContext";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-pink-subtle py-12 px-6 bg-deep">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <span className="text-pink font-bold text-lg">PROPULSOR</span>
          <p className="text-dimmed text-xs mt-2 leading-relaxed">
            {t.footer.tagline}
          </p>
        </div>
        <div>
          <span className="font-mono text-xs text-body-muted uppercase tracking-widest">{t.footer.techHeading}</span>
          <div className="mt-3 space-y-1">
            <p className="text-dimmed text-xs font-mono">Stellar Network</p>
            <p className="text-dimmed text-xs font-mono">Soroban Smart Contracts</p>
            <p className="text-dimmed text-xs font-mono">SEP-24 Anchors</p>
            <p className="text-dimmed text-xs font-mono">USDC Stablecoin</p>
          </div>
        </div>
        <div>
          <span className="font-mono text-xs text-body-muted uppercase tracking-widest">{t.footer.sheShipsHeading}</span>
          <p className="text-dimmed text-xs mt-3 leading-relaxed">
            {t.footer.sheShipsBody}
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-pink-subtle flex flex-col sm:flex-row justify-between items-center gap-4">
        <span className="text-dimmed text-xs font-mono">{t.footer.copyright}</span>
        <span className="text-dimmed text-xs font-mono">{t.footer.tagline2}</span>
      </div>
    </footer>
  );
};

export default Footer;
