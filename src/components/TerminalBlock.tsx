interface TerminalBlockProps {
  lines: { text: string; color?: "pink" | "mint" | "dimmed" | "default" }[];
  title?: string;
}

const colorMap = {
  pink: "text-pink",
  mint: "text-mint",
  dimmed: "text-dimmed",
  default: "text-body-muted",
};

const TerminalBlock = ({ lines, title }: TerminalBlockProps) => {
  return (
    <div className="terminal-bg rounded-sm overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b border-pink-subtle flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-pink-soft opacity-40" />
            <div className="w-2.5 h-2.5 rounded-full bg-body-muted opacity-20" />
            <div className="w-2.5 h-2.5 rounded-full bg-body-muted opacity-20" />
          </div>
          <span className="font-mono text-xs text-dimmed ml-2">{title}</span>
        </div>
      )}
      <div className="p-4 font-mono text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={colorMap[line.color || "default"]}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalBlock;
