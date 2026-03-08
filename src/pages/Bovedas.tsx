import DashboardLayout from "@/components/DashboardLayout";
import VaultCard from "@/components/VaultCard";

const mockVaults = [
  { name: "Hogar", icon: "🏠", percentage: 60, balance: 162.35, colorVariant: "pink" as const, isLocked: false },
  { name: "Fondo seguro", icon: "🔒", percentage: 30, balance: 81.18, colorVariant: "mint" as const, isLocked: true, unlockDate: "15 Abr 2026" },
  { name: "Meta grande", icon: "🚀", percentage: 10, balance: 27.06, colorVariant: "pink-soft" as const, isLocked: true, unlockDate: "1 Dic 2026", goalAmount: 500 },
];

const Bovedas = () => {
  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MIS BÓVEDAS</h1>
            <p className="text-body-muted text-xs font-mono mt-1">3 bóvedas activas</p>
          </div>
          <button className="btn-pink text-xs py-2 px-4 rounded-sm">
            + Nueva Bóveda
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockVaults.map((v, i) => (
            <VaultCard key={i} {...v} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Bovedas;
