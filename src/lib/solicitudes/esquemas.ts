import { z } from "zod";

import { SENTIDOS_RESOLUCION } from "@/lib/constantes";
import {
  esRfcMoral,
  RE_IMPORTE,
  zCantidad,
  zCheckbox,
  zFecha,
  zFechaOpcional,
  zFolioVucem,
  zFraccion,
  zRfc,
  zTexto,
} from "@/lib/validacion/comunes";

import { TAM } from "./validacion";

// Esquemas de los formularios de la solicitud. En un borrador se permiten datos incompletos
// (la validación previa señala lo que falta), pero lo que se captura debe tener formato válido.

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = (max: number) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());
const zPais = (mensaje: string) =>
  z
    .string({ error: mensaje })
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z]{3}$/.test(v), mensaje);

export const esquemaNuevaSolicitud = z.object({
  establecimientoId: zTexto(64, "Elige el establecimiento"),
});

export const esquemaDatosGenerales = z.object({
  establecimientoId: zTexto(64, "Elige el establecimiento"),
  cveRegimen: opcional(TAM.cveRegimen),
  cveAduana: z.preprocess(
    vacioAUndefined,
    z
      .string()
      .trim()
      .refine((v) => v.length === TAM.cveAduana, `La clave de aduana tiene ${TAM.cveAduana} caracteres`)
      .optional(),
  ),
});

export const esquemaAgregarPartida = z.object({
  productoId: zTexto(64, "Elige el producto"),
  cantidadUMT: zCantidad,
  cantidadUMC: zCantidad,
  cvePaisProcedencia: zPais("Elige el país de procedencia"),
  fechaCaducidad: zFechaOpcional,
  idUsoEspecifico: opcional(TAM.idUsoEspecifico),
});

/** Edición de la mercancía (snapshot del producto en la solicitud). */
export const esquemaPartida = z.object({
  idClasificacionProducto: opcional(TAM.idClasificacionProducto),
  idSubClasificacionProducto: opcional(TAM.idSubClasificacionProducto),
  denominacionEspecifica: zTexto(TAM.denominacionEspecifica, "La denominación específica es obligatoria"),
  denominacionDistintiva: zTexto(TAM.denominacionDistintiva, "La denominación distintiva (marca) es obligatoria"),
  denominacionComunCientifica: zTexto(500, "La denominación común o nombre científico es obligatorio"),
  idTipoProducto: opcional(TAM.idTipoProducto),
  especifique: opcional(500),
  idFormaFarmaceutica: opcional(50),
  idEstadoFisico: opcional(50),
  fraccionArancelaria: zFraccion,
  descripcionFraccion: opcional(500),
  cantidadUMT: zCantidad,
  cantidadUMC: zCantidad,
  umt: opcional(20),
  umc: opcional(20),
  desUMC: zTexto(TAM.desUMC, "La descripción de la UMC es obligatoria"),
  presentacionTipoEnvase: zTexto(TAM.presentacionTipoEnvase, "La presentación o tipo de envase es obligatoria"),
  numRegistroSanitario: opcional(TAM.numRegistroSanitario),
  fechaCaducidad: zFechaOpcional,
  cvePaisOrigen: zPais("Elige el país de origen"),
  cvePaisProcedencia: zPais("Elige el país de procedencia"),
  idUsoEspecifico: opcional(TAM.idUsoEspecifico),
});

export const esquemaTerceroSolicitud = z.object({
  terceroId: zTexto(64, "Elige un tercero"),
  rol: z.enum(["FABRICANTE", "PROVEEDOR", "DESTINATARIO", "FACTURADOR"], { error: "Rol inválido" }),
});

export const esquemaRepresentante = z
  .object({
    rlRfc: zRfc,
    rlNombre: opcional(TAM.rlNombre),
    rlApellidoPaterno: opcional(TAM.rlApellido),
    rlApellidoMaterno: opcional(TAM.rlApellido),
  })
  .superRefine((d, ctx) => {
    if (esRfcMoral(d.rlRfc)) return;
    if (!d.rlNombre) ctx.addIssue({ code: "custom", path: ["rlNombre"], message: "El nombre es obligatorio (RFC de persona física)" });
    if (!d.rlApellidoPaterno) {
      ctx.addIssue({ code: "custom", path: ["rlApellidoPaterno"], message: "El apellido paterno es obligatorio (RFC de persona física)" });
    }
  });

export const esquemaPago = z
  .object({
    pagoOmitido: zCheckbox,
    confirmarOmision: zCheckbox,
    claveReferencia: opcional(TAM.claveReferencia),
    cadenaDependencia: opcional(TAM.cadenaDependencia),
    cveBanco: opcional(TAM.cveBanco),
    llavePago: opcional(TAM.llavePago),
    fechaPago: zFechaOpcional,
    importePago: z.preprocess(
      vacioAUndefined,
      z
        .string()
        .trim()
        .transform((v) => v.replace(/[$,\s]/g, ""))
        .refine((v) => RE_IMPORTE.test(v) && Number(v) > 0, "Importe inválido (mayor a 0, hasta 13 enteros y 2 decimales)")
        .optional(),
    ),
  })
  .superRefine((d, ctx) => {
    if (d.pagoOmitido) {
      if (!d.confirmarOmision) {
        ctx.addIssue({ code: "custom", path: ["confirmarOmision"], message: "Confirma que la solicitud no requiere pago de derechos" });
      }
      return;
    }
    const faltan: Array<[keyof typeof d, string]> = [
      ["claveReferencia", "La clave de referencia es obligatoria"],
      ["cadenaDependencia", "La cadena de la dependencia es obligatoria"],
      ["cveBanco", "Elige el banco"],
      ["llavePago", "La llave de pago es obligatoria"],
      ["fechaPago", "La fecha de pago es obligatoria"],
      ["importePago", "El importe es obligatorio"],
    ];
    for (const [campo, message] of faltan) if (!d[campo]) ctx.addIssue({ code: "custom", path: [campo], message });
  });

export const esquemaManifiestos = z.object({
  cveDeclaracion: zCheckbox,
  /** Respuesta a "¿Está de acuerdo en hacer públicos los datos o anexos?" */
  publicos: z.enum(["SI", "NO"], { error: "Responde si estás de acuerdo en hacer públicos los datos o anexos" }),
});

export const esquemaLigarDocumento = z.object({
  documentoId: zTexto(64, "Elige un documento"),
  requisito: zTexto(64, "Requisito inválido"),
});

export const esquemaPresentacion = z.object({
  numeroTemporal: opcional(40),
  folioVucem: zFolioVucem,
  fechaPresentacion: zFecha,
});

export const esquemaRequerimiento = z.object({
  fechaNotificacion: zFecha,
  plazoDiasHabiles: z.coerce
    .number({ error: "Captura el plazo en días hábiles" })
    .int("El plazo debe ser un número entero de días hábiles")
    .min(1, "El plazo debe ser de al menos 1 día hábil")
    .max(365, "El plazo no puede exceder 365 días hábiles"),
  descripcion: zTexto(4000, "Describe lo que requiere la autoridad"),
});

export const esquemaAtencion = z.object({
  fechaAtencion: zFecha,
  notas: opcional(2000),
});

export const esquemaResolucion = z.object({
  sentido: z.enum(SENTIDOS_RESOLUCION, { error: "Elige el sentido de la resolución" }),
  numeroPermiso: zTexto(100, "Captura el número de permiso u oficio"),
  fechaResolucion: zFecha,
  vigenciaHasta: zFechaOpcional,
  restricciones: opcional(4000),
  observaciones: opcional(4000),
});

export const esquemaDiaInhabil = z.object({
  fecha: zFecha,
  descripcion: zTexto(200, "Describe el día inhábil (p. ej. «Vacaciones COFEPRIS, DOF 15/12/2026»)"),
});

/** Plazo mínimo que normalmente otorga la autoridad (art. 17-A LFPA). */
export const PLAZO_MINIMO_HABITUAL = 5;
