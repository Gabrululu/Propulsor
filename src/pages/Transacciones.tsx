import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TxRow from "@/components/TxRow";

const allTxs = [
  { type: "split" as const, description: "Separación automática", amount: 270.59, vault: "Todas", txHash: "GBPROPULSOR1234ABCDXF9A", timestamp: "8 Mar 2026, 14:30", status: "confirmed" as const },
  { type: "deposit" as const, description: "Depósito desde anchor SEP-24", amount: 270.59, vault: "—", txHash: "GBPROPULSOR5678EFGHXF9A", timestamp: "8 Mar 2026, 14:30", status: "confirmed" as const },
  { type: "lock" as const, description: "Bloqueo time-lock activado", amount: 27.06, vault: "Meta grande", txHash: "GBPROPULSOR9012IJKLXF9A", timestamp: "8 Mar 2026, 14:28", status: "confirmed" as const },
  { type: "deposit" as const, description: "Depósito inicial", amount: 135.30, vault: "—", txHash: "GBPROPULSORMNOPQRSTXF9A", timestamp: "5 Mar 2026, 10:00", status: "confirmed" as const },
  { type: "split" as const, description: "Separación automática", amount: 135.30, vault: "Todas", txHash: "GBPROPULSORUVWXYZ01XF9A", timestamp: "5 Mar 2026, 10:00", status: "confirmed" as const },
  { type: "withdrawal" as const, description: "Retiro a cuenta bancaria", amount: 50.00, vault: "Hogar", txHash: "GBPROPULSOR2345BCDFXF9A", timestamp: "3 Mar 2026, 16:45", status: "confirmed" as const },
];

const filters = ["Todos", "Depósitos", "Retiros", "Separaciones", "Bloqueos"];
const filterMap: Record<string, string | undefined> = {
  Todos: undefined,
  Depósitos: "deposit",
  Retiros: "withdrawal",
  Separaciones: "split",
  Bloqueos: "lock",
};

const Transacciones = () => {
  const [filter, setFilter] = useState("Todos");

  const filtered = filterMap[filter]
    ? allTxs.filter((tx) => tx.type === filterMap[filter])
    : allTxs;

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">TRANSACCIONES</h1>
        <p className="text-body-muted text-xs font-mono mb-8">{allTxs.length} transacciones totales</p>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${
                filter === f
                  ? "text-pink border-pink-visible bg-card-dark"
                  : "text-dimmed border-pink-subtle hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
          {filtered.length > 0 ? (
            filtered.map((tx, i) => <TxRow key={i} {...tx} />)
          ) : (
            <div className="p-8 text-center">
              <p className="text-body-muted text-sm">No hay transacciones de este tipo.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Transacciones;
