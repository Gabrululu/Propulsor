import { useLanguage } from "@/lib/i18n/LanguageContext";

interface PercentageSliderProps {
  values: number[];
  labels: string[];
  colors: ("pink" | "mint" | "pink-soft")[];
  onChange: (values: number[]) => void;
}

const colorBg: Record<string, string> = {
  pink: "#ffb3c6",
  mint: "#b8f0c8",
  "pink-soft": "#e8a0b4",
};

const PercentageSlider = ({
  values,
  labels,
  colors,
  onChange,
}: PercentageSliderProps) => {
  const { language } = useLanguage();
  const handleChange = (index: number, newVal: number) => {
    const clamped = Math.max(1, Math.min(98, newVal));
    const otherIndices = values.map((_, i) => i).filter((i) => i !== index);
    const newValues = [...values];
    newValues[index] = clamped;
    let remaining = 100 - clamped - otherIndices.length;
    let weight = otherIndices.reduce((sum, i) => sum + values[i], 0);
    otherIndices.forEach((i, position) => {
      const extra =
        position === otherIndices.length - 1
          ? remaining
          : Math.min(
              remaining,
              Math.max(0, Math.round((remaining * values[i]) / weight)),
            );
      newValues[i] = 1 + extra;
      remaining -= extra;
      weight -= values[i];
    });

    onChange(newValues);
  };

  return (
    <div className="space-y-4">
      {values.map((val, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">{labels[i]}</span>
            <span
              className="font-mono text-sm"
              style={{ color: colorBg[colors[i]] }}
            >
              {val}%
            </span>
          </div>
          <input
            aria-label={labels[i]}
            aria-valuetext={`${val}%; S/${val} ${language === "es" ? "por cada S/100" : "per S/100"}`}
            type="range"
            min={1}
            max={98}
            value={val}
            onChange={(e) => handleChange(i, parseInt(e.target.value))}
            className="w-full h-11 rounded-sm cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${colorBg[colors[i]]} ${val}%, #2e2729 ${val}%)`,
              accentColor: colorBg[colors[i]],
            }}
          />
          <p className="text-sm text-muted-foreground">
            {language === "es"
              ? `Si recibes S/100 → S/${val} para ${labels[i]}`
              : `If you receive S/100 → S/${val} for ${labels[i]}`}
          </p>
        </div>
      ))}

      {/* Visual bar */}
      <div className="flex rounded-sm overflow-hidden h-3 mt-2">
        {values.map((val, i) => (
          <div
            key={i}
            style={{ width: `${val}%`, backgroundColor: colorBg[colors[i]] }}
            className="transition-all duration-300"
          />
        ))}
      </div>
    </div>
  );
};

export default PercentageSlider;
