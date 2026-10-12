import { z } from "zod";

// Validadores compartidos entre cliente y servidor.

/** RFC: 12 caracteres (moral) o 13 (física), en mayúsculas. Acepta Ñ y &. */
export const RE_RFC = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;
export const RE_CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
export const RE_CP_MX = /^\d{5}$/;
export const RE_FRACCION = /^\d{8}$/;
export const RE_SCIAN = /^\d{6}$/;
/** Folio oficial de VUCEM: 25 dígitos. */
export const RE_FOLIO_VUCEM = /^\d{25}$/;
/** Cantidades del WS: hasta 18 posiciones con 3 decimales. */
export const RE_CANTIDAD = /^\d{1,15}(\.\d{1,3})?$/;
/** Importe del pago: hasta 13 enteros y 2 decimales. */
export const RE_IMPORTE = /^\d{1,13}(\.\d{1,2})?$/;

export function normalizarRfc(valor: string): string {
  return valor.trim().toUpperCase().replace(/\s+/g, "");
}

export function esRfcValido(valor: string): boolean {
  return RE_RFC.test(normalizarRfc(valor));
}

export function esRfcMoral(valor: string): boolean {
  return normalizarRfc(valor).length === 12;
}

/** Convierte "" en undefined para campos opcionales de formularios. */
const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const zTextoOpcional = (max = 500) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max).optional());

export const zTexto = (max = 500, mensaje = "Este campo es obligatorio") =>
  z.string({ error: mensaje }).trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`);

export const zRfc = z
  .string({ error: "El RFC es obligatorio" })
  .transform(normalizarRfc)
  .refine((v) => RE_RFC.test(v), "RFC inválido (12 o 13 caracteres)");

export const zRfcOpcional = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .transform(normalizarRfc)
    .refine((v) => RE_RFC.test(v), "RFC inválido (12 o 13 caracteres)")
    .optional(),
);

export const zCurpOpcional = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => RE_CURP.test(v), "CURP inválida")
    .optional(),
);

export const zCorreo = z.string().trim().toLowerCase().email("Correo electrónico inválido").max(320);

export const zCorreoOpcional = z.preprocess(vacioAUndefined, zCorreo.optional());

export const zFraccion = z
  .string()
  .trim()
  .refine((v) => RE_FRACCION.test(v), "La fracción arancelaria debe tener 8 dígitos");

export const zFolioVucem = z
  .string()
  .trim()
  .refine((v) => RE_FOLIO_VUCEM.test(v), "El folio de VUCEM debe tener 25 dígitos");

export const zCantidad = z
  .string()
  .trim()
  .refine((v) => RE_CANTIDAD.test(v) && Number(v) > 0, "Cantidad inválida (hasta 3 decimales, mayor a 0)");

export const zImporteOpcional = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .trim()
    .refine((v) => RE_IMPORTE.test(v), "Importe inválido (hasta 13 enteros y 2 decimales)")
    .optional(),
);

/** Checkbox de formulario HTML ("on" | null) → boolean. */
export const zCheckbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Fecha de <input type="date"> (yyyy-mm-dd) → Date (mediodía UTC para evitar desfases). */
export const zFechaOpcional = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .transform((v) => new Date(`${v}T12:00:00.000Z`))
    .optional(),
);

export const zFecha = z
  .string({ error: "La fecha es obligatoria" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .transform((v) => new Date(`${v}T12:00:00.000Z`));
