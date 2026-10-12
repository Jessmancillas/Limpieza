import { z } from "zod";

import { TIPOS_DOCUMENTO } from "@/lib/constantes";

/**
 * Definición versionada del trámite (se guarda como JSON en TramiteVersion.definicion).
 * Los requisitos y límites pueden cambiar por acuerdos de simplificación de COFEPRIS o por
 * cambios de plataforma (VUCEM clásica → VUCEM 3.0), por eso no están fijos en el código.
 */
export const esquemaDefinicionTramite = z.object({
  requisitos: z.array(
    z.object({
      /** Identificador del requisito dentro del trámite. */
      clave: z.string(),
      nombre: z.string(),
      /** Tipos de documento que cubren el requisito (cualquiera de ellos). */
      tipos: z.array(z.enum(TIPOS_DOCUMENTO)).min(1),
      obligatorio: z.boolean(),
      /** Si true, se exige un documento por cada producto (p. ej. registro sanitario). */
      porProducto: z.boolean().default(false),
      nota: z.string().optional(),
    }),
  ),
  limitesPdf: z.object({
    maxMB: z.number().positive(),
    minDpi: z.number().int().positive(),
  }),
  notas: z.string().optional(),
});

export type DefinicionTramite = z.infer<typeof esquemaDefinicionTramite>;

export function leerDefinicion(json: string): DefinicionTramite {
  return esquemaDefinicionTramite.parse(JSON.parse(json));
}

/** Definición inicial del trámite 260211 (ver prisma/seed.ts). */
export const DEFINICION_260211_INICIAL: DefinicionTramite = {
  requisitos: [
    {
      clave: "LICENCIA_O_AVISO",
      nombre: "Licencia sanitaria o aviso de funcionamiento",
      tipos: ["LICENCIA_SANITARIA", "AVISO_FUNCIONAMIENTO"],
      obligatorio: true,
      porProducto: false,
    },
    {
      clave: "AVISO_RESPONSABLE",
      nombre: "Aviso de responsable sanitario",
      tipos: ["AVISO_RESPONSABLE"],
      obligatorio: true,
      porProducto: false,
      nota: "Obligatorio en trámites COFEPRIS análogos de VUCEM 3.0; confirmar para 260211.",
    },
    {
      clave: "REGISTRO_SANITARIO",
      nombre: "Registro sanitario vigente y sus modificaciones",
      tipos: ["REGISTRO_SANITARIO"],
      obligatorio: true,
      porProducto: true,
    },
    {
      clave: "MARBETE",
      nombre: "Proyecto de marbete / etiqueta",
      tipos: ["MARBETE"],
      obligatorio: false,
      porProducto: false,
    },
    {
      clave: "PAGO_DERECHOS",
      nombre: "Comprobante de pago de derechos",
      tipos: ["PAGO_DERECHOS"],
      obligatorio: false,
      porProducto: false,
      nota: "Los datos del pago (e5cinco) se capturan en la solicitud.",
    },
    {
      clave: "OTRO",
      nombre: "Otros documentos",
      tipos: ["OTRO"],
      obligatorio: false,
      porProducto: false,
    },
  ],
  limitesPdf: { maxMB: 10, minDpi: 300 },
  notas:
    "Basado en el Manual WS 260211 (SAT-AGCTI v1.0, 17/04/2019) y en trámites COFEPRIS análogos de VUCEM 3.0. " +
    "Revisar contra la ficha vigente del trámite tras el Acuerdo de simplificación COFEPRIS (DOF 11/08/2025).",
};
