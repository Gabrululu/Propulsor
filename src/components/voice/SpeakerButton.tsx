interface SpeakerButtonProps {
  isSpeaking: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}

const SpeakerButton = ({ isSpeaking, onClick, label = "ESCUCHAR", className = "" }: SpeakerButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${className}`}
      type="button"
    >
      <span
        className={`text-lg transition-all ${
          isSpeaking ? "animate-voice-pulse text-pink" : "text-dimmed"
        }`}
      >
        🔊
      </span>
      <span className="font-mono text-[0.55rem] uppercase tracking-wider text-dimmed">
        {label}
      </span>
    </button>
  );
};

export default SpeakerButton;
