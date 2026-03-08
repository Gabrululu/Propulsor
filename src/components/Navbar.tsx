import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-pink-subtle" style={{ background: "rgba(30,26,27,0.9)", backdropFilter: "blur(12px)" }}>
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-pink font-bold text-lg tracking-tight">PROPULSOR</span>
          <span className="font-mono text-[9px] text-dimmed border border-pink-subtle px-1.5 py-0.5 rounded-sm">
            SHE SHIPS 2026
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <a href="#problem" className="text-body-muted text-xs font-mono uppercase tracking-wider hover:text-foreground transition-colors">
            Problema
          </a>
          <Link to="/simular" className="text-body-muted text-xs font-mono uppercase tracking-wider hover:text-foreground transition-colors">
            Simular
          </Link>
          <a href="#waitlist" className="text-body-muted text-xs font-mono uppercase tracking-wider hover:text-foreground transition-colors">
            Waitlist
          </a>
          <Link to="/dashboard" className="btn-pink text-xs py-2 px-4 rounded-sm">
            Entrar
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
