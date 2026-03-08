import { ReactNode } from "react";

interface StatCardProps {
  value: string;
  label: string;
  color?: "pink" | "mint" | "pink-soft";
}

const colorMap = {
  pink: "text-pink",
  mint: "text-mint",
  "pink-soft": "text-pink-soft",
};

const StatCard = ({ value, label, color = "pink" }: StatCardProps) => {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono text-3xl md:text-4xl font-bold ${colorMap[color]}`}>
        {value}
      </span>
      <span className="text-body-muted text-sm leading-relaxed">{label}</span>
    </div>
  );
};

export default StatCard;
