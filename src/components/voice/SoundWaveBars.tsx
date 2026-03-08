interface SoundWaveBarsProps {
  isActive: boolean;
  className?: string;
}

const SoundWaveBars = ({ isActive, className = "" }: SoundWaveBarsProps) => {
  return (
    <div className={`flex items-end gap-[3px] h-[14px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-pink transition-all"
          style={{
            height: isActive ? undefined : "4px",
            animation: isActive
              ? `soundWave 0.8s ease-in-out ${i * 0.15}s infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
};

export default SoundWaveBars;
