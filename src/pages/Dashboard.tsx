import { useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import SplitBar from "@/components/SplitBar";
import TxRow from "@/components/TxRow";
import { useStellarBalance } from "@/hooks/useStellarBalance";
import { isSimulationMode, getHorizonServer } from "@/lib/stellar/client";
import { toast } from "@/hooks/use-toast";

const DEMO_PUBLIC_KEY = null; // Set to real key after onboarding

const mockVaults = [
  { name: "Hogar", icon: "🏠", balance: 162.35, pct: 60, color: "pink" as const },
  { name: "Fondo seguro", icon: "🔒", balance: 81.18, pct: 30, color: "mint" as const },
  { name: "Meta grande", icon: "🚀", balance: 27.06, pct: 10, color: "pink-soft" as const },
];

const mockTxs = [
  { type: "split" as const, description: "Separación automática", amount: 270.59, vault: "Todas", txHash: "GBPROPULSOR1234ABCDXF9A", timestamp: "Hace 2h", status: "confirmed" as const },
  { type: "deposit" as const, description: "Depósito desde anchor", amount: 270.59, vault: "—", txHash: "GBPROPULSOR5678EFGHXF9A", timestamp: "Hace 2h", status: "confirmed" as const },
  { type: "lock" as const, description: "Bloqueo time-lock activado", amount: 27.06, vault: "Meta grande", txHash: "GBPROPULSOR9012IJKLXF9A", timestamp: "Hace 3h", status: "confirmed" as const },
];

const colorBg: Record<string, string> = { pink: "#ffb3c6", mint: "#b8f0c8", "pink-soft": "#e8a0b4" };

const Dashboard = () => {
  const { balance } = useStellarBalance(DEMO_PUBLIC_KEY);
  const streamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!DEMO_PUBLIC_KEY) return;

    const setupStream = async () => {
      try {
        const server = await getHorizonServer();
        const closeStream = server
          .payments()
          .forAccount(DEMO_PUBLIC_KEY)
          .stream({
            onmessage: (payment: any) => {
              if (payment.type === "payment" && payment.to === DEMO_PUBLIC_KEY) {
                toast({
                  title: "💜 Pago recibido",
                  description: `+${parseFloat(payment.amount).toFixed(2)} ${payment.asset_code || "XLM"}`,
                });
              }
            },
          });
        streamRef.current = closeStream as unknown as () => void;
      } catch {}
    };

    setupStream();

    return () => {
      if (streamRef.current) streamRef.current();
    };
  }, []);

  const totalBalance = DEMO_PUBLIC_KEY ? balance.usdc : mockVaults.reduce((s, v) => s + v.balance, 0);

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Hola, María 👋</h1>
            <p className="text-body-muted text-xs font-mono mt-1">8 de marzo, 2026</p>
          </div>
        </div>

        {isSimulationMode && (
          <div className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.6rem] px-2.5 py-1 rounded-sm border border-pink-visible bg-card-dark text-pink-soft">
            ⚡ TESTNET SIMULATION — Contratos aún no desplegados
          </div>
        )}

        <div className="bg-card-dark border border-pink-subtle rounded-sm p-6 mb-8">
          <span className="text-body-muted text-xs font-mono uppercase tracking-widest">Balance total</span>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-4xl md:text-5xl font-bold text-pink">
              ${totalBalance.toFixed(2)}
            </span>
            <span className="text-body-muted text-sm">USDC</span>
          </div>
          <p className="text-dimmed text-xs font-mono mt-1">≈ S/ {(totalBalance * 3.71).toFixed(2)}</p>
          {DEMO_PUBLIC_KEY && balance.xlm > 0 && (
            <p className="text-dimmed text-xs font-mono mt-0.5">{balance.xlm.toFixed(4)} XLM</p>
          )}
          <div className="mt-6">
            <SplitBar
              segments={mockVaults.map((v) => ({ percentage: v.pct, color: v.color, label: v.name }))}
              height={8}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {mockVaults.map((v, i) => (
            <div
              key={i}
              className="bg-card-dark p-4 rounded-sm border border-pink-subtle"
              style={{ borderLeft: `3px solid ${colorBg[v.color]}` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>{v.icon}</span>
                <span className="text-sm font-bold uppercase" style={{ color: colorBg[v.color] }}>{v.name}</span>
              </div>
              <span className="font-mono text-xl font-bold text-foreground">${v.balance.toFixed(2)}</span>
              <div className="w-full h-1 bg-deep rounded-sm mt-2 overflow-hidden">
                <div className="h-full" style={{ width: `${v.pct}%`, backgroundColor: colorBg[v.color] }} />
              </div>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-bold text-foreground mb-4">ACTIVIDAD RECIENTE</h2>
          <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
            {mockTxs.map((tx, i) => (
              <TxRow key={i} {...tx} />
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
