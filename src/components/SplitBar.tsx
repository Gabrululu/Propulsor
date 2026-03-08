interface SplitBarProps {
  segments: { percentage: number; color: "pink" | "mint" | "pink-soft"; label?: string }[];
  height?: number;
}

const colorClasses = {
  pink: "bar-pink",
  mint: "bar-mint",
  "pink-soft": "bar-pink-soft",
};

const SplitBar = ({ segments, height = 8 }: SplitBarProps) => {
  return (
    <div className="w-full">
      <div
        className="w-full flex rounded-sm overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${colorClasses[seg.color]} transition-all duration-500`}
            style={{ width: `${seg.percentage}%` }}
          />
        ))}
      </div>
      {segments[0]?.label && (
        <div className="flex justify-between mt-2">
          {segments.map((seg, i) => (
            <span key={i} className="text-body-muted text-xs font-mono">
              {seg.label} {seg.percentage}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default SplitBar;
