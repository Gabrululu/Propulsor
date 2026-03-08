import { useState, useCallback } from "react";

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

const PercentageSlider = ({ values, labels, colors, onChange }: PercentageSliderProps) => {
  const handleChange = (index: number, newVal: number) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    const diff = clamped - values[index];
    const otherIndices = values.map((_, i) => i).filter((i) => i !== index);
    const otherSum = otherIndices.reduce((s, i) => s + values[i], 0);

    if (otherSum === 0 && diff > 0) return;

    const newValues = [...values];
    newValues[index] = clamped;

    otherIndices.forEach((i) => {
      const proportion = otherSum > 0 ? values[i] / otherSum : 1 / otherIndices.length;
      newValues[i] = Math.max(0, Math.round(values[i] - diff * proportion));
    });

    // Ensure sum is exactly 100
    const sum = newValues.reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      const lastOther = otherIndices[otherIndices.length - 1];
      newValues[lastOther] += 100 - sum;
    }

    onChange(newValues);
  };

  return (
    <div className="space-y-4">
      {values.map((val, i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">{labels[i]}</span>
            <span className="font-mono text-sm" style={{ color: colorBg[colors[i]] }}>
              {val}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={val}
            onChange={(e) => handleChange(i, parseInt(e.target.value))}
            className="w-full h-1.5 rounded-sm appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${colorBg[colors[i]]} ${val}%, #2e2729 ${val}%)`,
              accentColor: colorBg[colors[i]],
            }}
          />
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
