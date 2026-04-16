import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extracts a non-empty message from any thrown value. */
export function errorMessage(err: unknown, fallback = "Error desconocido"): string {
  if (err instanceof Error) return err.message?.trim() || fallback;
  if (typeof err === "string") return err.trim() || fallback;
  return fallback;
}
