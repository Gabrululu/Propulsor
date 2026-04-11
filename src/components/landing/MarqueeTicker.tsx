const MarqueeTicker = () => {
  const items = [
    { text: "Independencia financiera", color: "pink" },
    { text: "Mujeres jefas de hogar", color: "mint" },
    { text: "Remesas protegidas", color: "pink" },
    { text: "Soroban Smart Contracts", color: "mint" },
    { text: "Time-Lock Vaults", color: "pink" },
    { text: "SEP-24 Anchors", color: "mint" },
    { text: "USDC", color: "pink" },
    { text: "Soles → Dólares", color: "mint" },
    { text: "Agente Autónomo", color: "pink" },
    { text: "x402 Payments", color: "mint" },
    { text: "Blend Protocol", color: "pink" },
    { text: "She Ships 2026 💜", color: "mint" },
  ];

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
