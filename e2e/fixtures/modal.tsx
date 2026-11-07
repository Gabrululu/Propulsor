import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../../src/lib/i18n/LanguageContext";
import { WalletProvider } from "../../src/lib/stellar/WalletContext";
import ConnectModal from "../../src/components/stellar/ConnectModal";
import "../../src/index.css";
export function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <LanguageProvider>
      <WalletProvider>
        <main>
          <h1>Prueba de conexión</h1>
          <button onClick={() => setOpen(true)}>Abrir cuenta</button>
          {open && (
            <ConnectModal
              onConnected={() => setOpen(false)}
              onClose={() => setOpen(false)}
            />
          )}
        </main>
      </WalletProvider>
    </LanguageProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
