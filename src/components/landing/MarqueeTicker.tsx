import { useLanguage } from "@/lib/i18n/LanguageContext";

const colors = ["pink", "mint", "pink", "mint", "pink", "mint", "pink", "mint", "pink", "mint", "pink", "mint"];

const MarqueeTicker = () => {
  const { t } = useLanguage();
  const items = t.marquee.map((text, i) => ({ text, color: colors[i] }));

  const row = items.map((item, i) => (
    <span key={i} className="flex items-center gap-4 whitespace-nowrap">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: item.color === "pink" ? "#ffb3c6" : "#b8f0c8" }}
      />
      <span className="font-mono text-xs text-body-muted uppercase tracking-wider">
        {item.text}
      </span>
    </span>
  ));

  return (
    <div className="w-full overflow-hidden border-y border-pink-subtle py-4 bg-deep">
      <div className="animate-marquee flex gap-8" style={{ width: "max-content" }}>
        <div className="flex gap-8">{row}</div>
        <div className="flex gap-8">{row}</div>
      </div>
    </div>
  );
};

export default MarqueeTicker;
