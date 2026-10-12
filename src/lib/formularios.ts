import type { z } from "zod";

/** Estado estándar que regresan las server actions de formularios (para useActionState). */
export type EstadoFormulario = {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string[]>;
  /** Valores enviados, para repoblar el formulario si hubo errores. */
  valores?: Record<string, string>;
};

export const ESTADO_INICIAL: EstadoFormulario = { ok: false };

/** Convierte un error de Zod en errores por campo. */
export function erroresDeZod(error: z.ZodError): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join(".") || "_";
    (errores[clave] ??= []).push(issue.message);
  }
  return errores;
}

/** FormData → objeto plano de strings (los archivos se omiten). */
export function formDataAObjeto(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    if (typeof valor === "string" && !clave.startsWith("$ACTION")) obj[clave] = valor;
  }
  return obj;
}

/** Formatea fecha como dd/mm/aaaa (zona de México). */
export function formatoFecha(fecha: Date | null | undefined): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(fecha);
}

/** Date → yyyy-mm-dd para <input type="date">. */
export function fechaAInput(fecha: Date | null | undefined): string {
  if (!fecha) return "";
  return fecha.toISOString().slice(0, 10);
}
