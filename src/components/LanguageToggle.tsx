import { useLanguage } from "@/lib/i18n/LanguageContext";

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center border border-pink-subtle rounded-sm overflow-hidden font-mono text-[10px] tracking-widest">
      <button
        onClick={() => setLanguage("es")}
        aria-pressed={language === "es"}
        className={`px-2 py-1 transition-colors ${language === "es" ? "" : "text-body-muted"}`}
        style={language === "es" ? { color: "#1e1a1b", backgroundColor: "#ffb3c6" } : undefined}
      >
        ES
      </button>
      <button
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className={`px-2 py-1 transition-colors ${language === "en" ? "" : "text-body-muted"}`}
        style={language === "en" ? { color: "#1e1a1b", backgroundColor: "#ffb3c6" } : undefined}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageToggle;
