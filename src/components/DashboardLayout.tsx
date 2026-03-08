import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import NetworkStatusPill from "@/components/NetworkStatusPill";
import WalletDisplay from "@/components/stellar/WalletDisplay";

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: "📊" },
  { label: "Mis Bóvedas", path: "/dashboard/bovedas", icon: "🔐" },
  { label: "Transacciones", path: "/dashboard/transacciones", icon: "📋" },
  { label: "Configuración", path: "/dashboard/configuracion", icon: "⚙️" },
];

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-deep border-r border-pink-subtle p-4 fixed top-0 left-0 h-screen">
        <Link to="/" className="text-pink font-bold text-lg mb-6 tracking-tight">
          PROPULSOR
        </Link>

        {/* Network status */}
        <div className="mb-6">
          <NetworkStatusPill />
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                  active
                    ? "bg-card-dark text-pink font-semibold"
                    : "text-body-muted hover:text-foreground hover:bg-hover-dark"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Wallet display */}
        <WalletDisplay />
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-56">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-deep border-t border-pink-subtle flex">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center py-3 text-xs transition-colors ${
                active ? "text-pink" : "text-body-muted"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="mt-0.5">{item.label.split(" ").pop()}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default DashboardLayout;
