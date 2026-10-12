import { z } from "zod";

import { zFechaOpcional, zFraccion, zTexto } from "./comunes";

// Datos de la mercancía: campos 19-37 del Manual WS 260211 (los que no dependen de la solicitud).
//  19 idClasificacionProducto SI Long 14 · 20 idSubClasificacionProducto SI Long 14 ·
//  21 denominacionEspecifica SI 256 · 22 denominacionDistintiva (marca) SI 120 ·
//  23 denominacionOnombreCientifico SI (sin tamaño) · 24 idTipoProducto SI 4 ·
//  25 especifique NO · 26 idFormaFarmaceutica SI · 27 idEstadoFisico SI · 28 fracción SI 8 ·
//  31 desUMC SI 100 · 32 presentacionTipoEnvase SI 250 · 33 numRegistroSanitario NO 50 ·
//  35 cvePaisOrigen SI 3 · 37 idUsoEspecifico SI 4.
// Forma farmacéutica y estado físico son propios de medicamentos: en el producto son opcionales
// y la validación de la solicitud avisa si VUCEM los exige.
export const LIMITES_PRODUCTO = {
  denominacionEspecifica: 256,
  denominacionDistintiva: 120,
  denominacionComunCientifica: 500,
  idClasificacionProducto: 14,
  idSubClasificacionProducto: 14,
  idTipoProducto: 4,
  especifique: 500,
  idFormaFarmaceutica: 50,
  idEstadoFisico: 50,
  descripcionFraccion: 500,
  unidadMedida: 20,
  desUMC: 100,
  presentacionTipoEnvase: 250,
  numRegistroSanitario: 50,
  idUsoEspecifico: 4,
  notas: 2000,
} as const;

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = (max: number) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());

export const esquemaProducto = z
  .object({
    denominacionEspecifica: zTexto(LIMITES_PRODUCTO.denominacionEspecifica, "La denominación específica es obligatoria"),
    denominacionDistintiva: zTexto(LIMITES_PRODUCTO.denominacionDistintiva, "La denominación distintiva (marca) es obligatoria"),
    denominacionComunCientifica: zTexto(
      LIMITES_PRODUCTO.denominacionComunCientifica,
      "La denominación común o nombre científico es obligatorio",
    ),
    idClasificacionProducto: zTexto(LIMITES_PRODUCTO.idClasificacionProducto, "Selecciona la clasificación del producto"),
    idSubClasificacionProducto: zTexto(LIMITES_PRODUCTO.idSubClasificacionProducto, "Selecciona la subclasificación del producto"),
    idTipoProducto: zTexto(LIMITES_PRODUCTO.idTipoProducto, "Selecciona el tipo de producto"),
    especifique: opcional(LIMITES_PRODUCTO.especifique),
    idFormaFarmaceutica: opcional(LIMITES_PRODUCTO.idFormaFarmaceutica),
    idEstadoFisico: opcional(LIMITES_PRODUCTO.idEstadoFisico),
    fraccionArancelaria: zFraccion,
    descripcionFraccion: opcional(LIMITES_PRODUCTO.descripcionFraccion),
    umt: opcional(LIMITES_PRODUCTO.unidadMedida),
    umc: opcional(LIMITES_PRODUCTO.unidadMedida),
    desUMC: zTexto(LIMITES_PRODUCTO.desUMC, "La descripción de la unidad de medida comercial es obligatoria"),
    presentacionTipoEnvase: zTexto(LIMITES_PRODUCTO.presentacionTipoEnvase, "La presentación o tipo de envase es obligatoria"),
    numRegistroSanitario: opcional(LIMITES_PRODUCTO.numRegistroSanitario),
    vigenciaRegistroSanitario: zFechaOpcional,
    cvePaisOrigen: z
      .string({ error: "Selecciona el país de origen" })
      .trim()
      .toUpperCase()
      .refine((v) => /^[A-Z]{3}$/.test(v), "Selecciona el país de origen (clave de 3 letras)"),
    idUsoEspecifico: zTexto(LIMITES_PRODUCTO.idUsoEspecifico, "Selecciona el uso específico"),
    fabricanteId: opcional(64),
    notas: opcional(LIMITES_PRODUCTO.notas),
  })
  .superRefine((d, ctx) => {
    if (d.vigenciaRegistroSanitario && !d.numRegistroSanitario) {
      ctx.addIssue({
        code: "custom",
        path: ["numRegistroSanitario"],
        message: "Captura el número de registro sanitario al que corresponde la vigencia",
      });
    }
  });

export type DatosProducto = z.infer<typeof esquemaProducto>;

/** Días de anticipación con que se avisa que un registro sanitario está por vencer. */
export const DIAS_AVISO_REGISTRO = 90;

export type EstadoRegistro = "SIN_REGISTRO" | "SIN_VIGENCIA" | "VENCIDO" | "POR_VENCER" | "VIGENTE";

const MS_DIA = 86_400_000;

/** Día calendario (medianoche UTC) de una fecha según la hora de la Ciudad de México. */
function diaEnMexico(fecha: Date): number {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(fecha)
    .split("-")
    .map(Number);
  return Date.UTC(a, m - 1, d);
}

/**
 * Estado del registro sanitario de un producto. La vigencia se guarda como fecha (mediodía UTC)
 * y el registro es válido hasta ese día inclusive.
 */
export function estadoRegistroSanitario(
  p: { numRegistroSanitario: string | null; vigenciaRegistroSanitario: Date | null },
  hoy: Date = new Date(),
): { estado: EstadoRegistro; dias: number | null } {
  if (!p.numRegistroSanitario?.trim()) return { estado: "SIN_REGISTRO", dias: null };
  if (!p.vigenciaRegistroSanitario) return { estado: "SIN_VIGENCIA", dias: null };
  const v = p.vigenciaRegistroSanitario;
  const dias = Math.round((Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()) - diaEnMexico(hoy)) / MS_DIA);
  if (dias < 0) return { estado: "VENCIDO", dias };
  if (dias <= DIAS_AVISO_REGISTRO) return { estado: "POR_VENCER", dias };
  return { estado: "VIGENTE", dias };
}

/** Texto de la copia de un producto ("(copia)" al final, respetando el tamaño máximo). */
export function denominacionCopia(denominacion: string): string {
  const sufijo = " (copia)";
  return denominacion.slice(0, LIMITES_PRODUCTO.denominacionEspecifica - sufijo.length) + sufijo;
}
