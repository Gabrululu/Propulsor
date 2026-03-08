export const ONBOARDING_WELCOME =
  "Hola, bienvenida a Propulsor. Estoy aquí para ayudarte a proteger tu dinero. Solo toma 3 minutos. ¿Empezamos?";

export const PROFILE_DESCRIPTIONS: Record<string, string> = {
  jefa_hogar: "Gestiona los gastos del hogar y cuida a tu familia.",
  emprendedora: "Tienes tu propio negocio o vendes por tu cuenta.",
  trabajadora: "Recibes un sueldo fijo cada quincena o mes.",
  freelancer: "Tus ingresos varían según los proyectos que consigues.",
};

export function buildSplitConfirmation(
  vaultNames: string[],
  percentages: number[],
  totalAmount?: number
): string {
  if (!totalAmount || totalAmount === 0) {
    return "Tus bóvedas están listas. A partir de ahora, cada ingreso se separará automáticamente.";
  }

  const parts = vaultNames.map((name, i) => {
    const amount = Math.round((percentages[i] / 100) * totalAmount);
    return `${amount} soles para ${name.toLowerCase()}`;
  });

  const last = parts.pop();
  const joined = parts.length > 0 ? `${parts.join(", ")}, y ${last}` : last;

  return `Listo. Separé ${joined}. Tu dinero ya está protegido.`;
}

export function buildSimulatorSummary(
  penAmount: number,
  vaultNames: string[],
  percentages: number[]
): string {
  if (!penAmount || penAmount === 0) {
    return "Ingresa un monto en soles para escuchar el resumen.";
  }

  const parts = vaultNames.map((name, i) => {
    const amount = Math.round((percentages[i] / 100) * penAmount);
    return `${amount} soles para ${name.toLowerCase()}`;
  });

  const last = parts.pop();
  const joined = parts.length > 0 ? `${parts.join(", ")}, y ${last}` : last;

  return `Si recibes ${Math.round(penAmount).toLocaleString()} soles, Propulsor separaría automáticamente: ${joined}. Todo en menos de 5 segundos. Sin banco. Sin comisión.`;
}
