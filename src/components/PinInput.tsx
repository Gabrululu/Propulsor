import { useId } from "react";

export default function PinInput({ label, value, onChange, description, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; description?: string; disabled?: boolean;
}) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm text-foreground">{label}</label>
    <input id={id} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
      autoComplete="off" value={value} disabled={disabled}
      aria-describedby={description ? `${id}-help` : undefined}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
      className="w-full min-h-12 bg-card border border-border rounded-sm px-4 py-3 text-foreground text-center text-xl tracking-[0.5rem] focus:outline-none focus:ring-2 focus:ring-primary" />
    {description && <p id={`${id}-help`} className="text-sm text-muted-foreground">{description}</p>}
  </div>;
}
