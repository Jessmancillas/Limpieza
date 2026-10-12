import { z } from "zod";

import { ESTADOS_CONVERSION, ESTADOS_EDOCUMENT, TIPOS_DOCUMENTO, type EstadoConversion, type EstadoEDocument } from "@/lib/constantes";
import { MAX_NOMBRE_DOCUMENTO } from "@/lib/pdf/limites";
import { normalizarNombreDocumento } from "@/lib/pdf/nombre-documento";
import { zFechaOpcional } from "@/lib/validacion/comunes";

// Validación de los datos de un documento (compartida por el alta y la edición; sin dependencias de servidor).

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Id de un registro (cuid) elegido en una lista; se verifica en el servidor que sea de la empresa. */
const zIdOpcional = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, "Elige una opción de la lista")
    .optional(),
);

export const esquemaMetadatosDocumento = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO, { error: "Elige el tipo de documento" }),
  nombre: z
    .string({ error: "Escribe un nombre descriptivo" })
    .trim()
    .min(1, "Escribe un nombre descriptivo")
    .max(MAX_NOMBRE_DOCUMENTO, `Máximo ${MAX_NOMBRE_DOCUMENTO} caracteres`)
    .transform(normalizarNombreDocumento)
    .pipe(z.string().min(1, "El nombre debe tener letras o números")),
  /** idTipoDocumento del servicio de digitalización de VUCEM (CAT_TIPO_DOCUMENTO). */
  idTipoDocumentoVucem: z.preprocess(
    vacioAUndefined,
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,10}$/, "Clave inválida (solo letras y números, máximo 10)")
      .optional(),
  ),
  productoId: zIdOpcional,
  establecimientoId: zIdOpcional,
  vigenciaHasta: zFechaOpcional.refine(
    (f) => f === undefined || (!Number.isNaN(f.getTime()) && f.getUTCFullYear() >= 1990 && f.getUTCFullYear() <= 2100),
    "Fecha inválida",
  ),
});

export type MetadatosDocumento = z.infer<typeof esquemaMetadatosDocumento>;

export const ETIQUETA_ESTADO_CONVERSION: Record<EstadoConversion, string> = {
  PENDIENTE: "Pendiente",
  OK: "Lista para VUCEM",
  ADVERTENCIA: "Lista, con avisos",
  ERROR: "Error de conversión",
};

export const ETIQUETA_ESTADO_EDOCUMENT: Record<EstadoEDocument, string> = {
  NO_ENVIADO: "Sin digitalizar",
  PENDIENTE: "Digitalización en proceso",
  OK: "Digitalizado",
  ERROR: "Error al digitalizar",
};

export function esEstadoConversion(v: string): v is EstadoConversion {
  return (ESTADOS_CONVERSION as readonly string[]).includes(v);
}

export function esEstadoEDocument(v: string): v is EstadoEDocument {
  return (ESTADOS_EDOCUMENT as readonly string[]).includes(v);
}
