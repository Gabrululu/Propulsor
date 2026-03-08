interface FlowNodeProps {
  label: string;
  color?: "pink" | "mint";
  size?: number;
}

const FlowNode = ({ label, color = "pink", size = 40 }: FlowNodeProps) => {
  const borderColor = color === "pink" ? "rgba(255,179,198,0.4)" : "rgba(184,240,200,0.4)";
  const glowColor = color === "pink" ? "rgba(255,179,198,0.08)" : "rgba(184,240,200,0.08)";
  const textColor = color === "pink" ? "text-pink" : "text-mint";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          transform: "rotate(45deg)",
          border: `1px solid ${borderColor}`,
          background: glowColor,
        }}
      >
        <div style={{ transform: "rotate(-45deg)" }}>
          <div className={`w-2 h-2 rounded-full ${color === "pink" ? "bar-pink" : "bar-mint"}`} />
        </div>
      </div>
      <span className={`font-mono text-xs ${textColor} text-center mt-1`}>{label}</span>
    </div>
  );
};

export default FlowNode;
