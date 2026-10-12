import { z } from "zod";

import { formDataAObjeto } from "@/lib/formularios";

import { RE_CP_MX, RE_SCIAN, zCheckbox, zCorreo, zRfc, zTexto } from "./comunes";

// Datos del establecimiento: campos 3-16 del Manual WS 260211.
// Tamaños máximos ("Tam") del manual:
//  3 denominacionRazonSocial 100 · 4 calleEstablecimiento 120 · 5 numeroExterior (el manual dice
//  320, probable errata; se usa 55 como en terceros) · 6 codigoPostal 12 (catálogo de CP del SAT:
//  5 dígitos) · 7 entidadFederativa 12 (CAT_ENTIDAD) · 8 municipio 120 · 9 colonia 100 ·
//  10 localidad 100 · 11 noLicenciaSanitaria 20 · 12 correo 320 · 13 RFC responsable 13 ·
//  14 teléfono 30 · 15 cveScian 6 (1..N) · 16 avisoFuncionamiento 0/1.
// La entidad es una clave de CAT_ENTIDAD: la acción la valida contra el catálogo y aquí solo se
// pone un tope amplio, porque la semilla provisional usa el nombre del estado (hasta 19
// caracteres, p. ej. "BAJA CALIFORNIA SUR") mientras se confirma el catálogo oficial.
export const LIMITES_ESTABLECIMIENTO = {
  denominacionRazonSocial: 100,
  calle: 120,
  numeroExterior: 55,
  entidadFederativa: 50,
  municipio: 120,
  colonia: 100,
  localidad: 100,
  noLicenciaSanitaria: 20,
  correoElectronico: 320,
  telefono: 30,
  scianDescripcion: 500,
} as const;

/** Tope de claves SCIAN por establecimiento (el manual admite "N"; evita envíos desmedidos). */
export const MAX_SCIAN = 50;

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = (max: number) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());

export const esquemaScian = z.object({
  clave: z
    .string({ error: "La clave SCIAN es obligatoria" })
    .trim()
    .refine((v) => RE_SCIAN.test(v), "La clave SCIAN debe tener 6 dígitos"),
  descripcion: opcional(LIMITES_ESTABLECIMIENTO.scianDescripcion),
});

export const esquemaEstablecimiento = z
  .object({
    denominacionRazonSocial: zTexto(LIMITES_ESTABLECIMIENTO.denominacionRazonSocial, "La denominación o razón social es obligatoria"),
    rfcResponsableSanitario: zRfc,
    correoElectronico: zCorreo,
    telefono: zTexto(LIMITES_ESTABLECIMIENTO.telefono, "El teléfono es obligatorio"),
    calle: zTexto(LIMITES_ESTABLECIMIENTO.calle, "La calle es obligatoria"),
    numeroExterior: opcional(LIMITES_ESTABLECIMIENTO.numeroExterior),
    codigoPostal: z
      .string({ error: "El código postal es obligatorio" })
      .trim()
      .refine((v) => RE_CP_MX.test(v), "El código postal debe tener 5 dígitos"),
    entidadFederativa: zTexto(LIMITES_ESTABLECIMIENTO.entidadFederativa, "Selecciona la entidad federativa"),
    municipio: zTexto(LIMITES_ESTABLECIMIENTO.municipio, "El municipio o alcaldía es obligatorio"),
    colonia: opcional(LIMITES_ESTABLECIMIENTO.colonia),
    localidad: opcional(LIMITES_ESTABLECIMIENTO.localidad),
    noLicenciaSanitaria: opcional(LIMITES_ESTABLECIMIENTO.noLicenciaSanitaria),
    tieneAvisoFuncionamiento: zCheckbox,
    scian: z
      .array(esquemaScian, { error: "Agrega al menos una clave SCIAN" })
      .min(1, "Agrega al menos una clave SCIAN")
      .max(MAX_SCIAN, `Máximo ${MAX_SCIAN} claves SCIAN por establecimiento`),
  })
  .superRefine((d, ctx) => {
    // En el portal la licencia sanitaria y el aviso de funcionamiento son excluyentes.
    if (d.noLicenciaSanitaria && d.tieneAvisoFuncionamiento) {
      ctx.addIssue({
        code: "custom",
        path: ["noLicenciaSanitaria"],
        message: "Captura el número de licencia sanitaria o marca el aviso de funcionamiento, no ambos (en VUCEM son excluyentes).",
      });
    }
    const vistas = new Set<string>();
    d.scian.forEach((s, i) => {
      if (vistas.has(s.clave)) {
        ctx.addIssue({ code: "custom", path: ["scian", i, "clave"], message: "Clave SCIAN repetida" });
      }
      vistas.add(s.clave);
    });
  });

export type DatosEstablecimiento = z.infer<typeof esquemaEstablecimiento>;

/** Arma la entrada del esquema a partir del formulario (las claves SCIAN llegan como campos repetidos). */
export function entradaEstablecimientoDesdeFormData(formData: FormData) {
  const valores = formDataAObjeto(formData);
  const claves = formData.getAll("scianClave").map((v) => String(v));
  const descripciones = formData.getAll("scianDescripcion").map((v) => String(v));
  const scian = claves
    .map((clave, i) => ({ clave: clave.trim(), descripcion: (descripciones[i] ?? "").trim() }))
    .filter((f) => f.clave !== "" || f.descripcion !== "");
  delete valores.scianClave;
  delete valores.scianDescripcion;
  return { valores, entrada: { ...valores, scian } };
}

/** true si el establecimiento no tiene ni licencia sanitaria ni aviso de funcionamiento. */
export function faltaLicenciaOAviso(e: { noLicenciaSanitaria: string | null; tieneAvisoFuncionamiento: boolean }): boolean {
  return !e.noLicenciaSanitaria?.trim() && !e.tieneAvisoFuncionamiento;
}
