import { z } from "zod";

import { NACIONALIDADES, TIPOS_PERSONA, TIPOS_TERCERO } from "@/lib/constantes";

import { esRfcMoral, RE_CP_MX, zCorreoOpcional, zCurpOpcional, zRfcOpcional, zTexto } from "./comunes";

// Terceros del Manual WS 260211: proveedores (40-53), fabricantes (54-67), destinatarios (68-84)
// y facturadores (85-98). Proveedor, fabricante y facturador comparten estructura:
//   tipoPersona SI · nombre SI 200 · apellidoPaterno SI 200 · apellidoMaterno NO 200 ·
//   denominacionRazonSocial SI 254 · correo SI 320 · pais SI 3 · entidadFederativa SI 6 ·
//   cp NO 12 · calle SI 100 · numeroExterior SI 55 · numeroInterior NO 55 · lada NO 44 ·
//   telefono NO 30.
// El destinatario cambia: denominacionRazonSocial SI 100 · rfc SI 13 · correo NO 320 ·
//   cp SI 12 · estado (entidad) SI 12 · municipio SI · localidad SI 120 · colonia SI 120 ·
//   calle SI 100 · numeroExterior SI 9 · numeroInterior SI 55 · telefono SI 30.
//   (El manual da 6 para el municipio del destinatario, pero su propio ejemplo lo excede; se
//   acepta texto de hasta 120 como en el establecimiento.)
// Entidad federativa: los tamaños 6 / 12 se aplican al texto libre de extranjeros. Para
// nacionales es una clave de CAT_ENTIDAD que la acción valida contra el catálogo (la semilla
// provisional usa nombres de hasta 19 caracteres mientras se confirma el catálogo oficial).
export const LIMITES_TERCERO = {
  nombre: 200,
  apellidoPaterno: 200,
  apellidoMaterno: 200,
  denominacionRazonSocial: 254,
  denominacionDestinatario: 100,
  correoElectronico: 320,
  entidadFederativa: 6,
  entidadFederativaDestinatario: 12,
  entidadFederativaCatalogo: 50,
  municipio: 120,
  colonia: 120,
  localidad: 120,
  codigoPostal: 12,
  calle: 100,
  numeroExterior: 55,
  numeroExteriorDestinatario: 9,
  numeroInterior: 55,
  lada: 44,
  telefono: 30,
} as const;

const vacioAUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opcional = (max: number) =>
  z.preprocess(vacioAUndefined, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());

export const esquemaTercero = z
  .object({
    tipo: z.enum(TIPOS_TERCERO, { error: "Selecciona el tipo de tercero" }),
    tipoPersona: z.enum(TIPOS_PERSONA, { error: "Selecciona el tipo de persona" }),
    nacionalidad: z.enum(NACIONALIDADES, { error: "Selecciona la nacionalidad" }),
    nombre: opcional(LIMITES_TERCERO.nombre),
    apellidoPaterno: opcional(LIMITES_TERCERO.apellidoPaterno),
    apellidoMaterno: opcional(LIMITES_TERCERO.apellidoMaterno),
    denominacionRazonSocial: opcional(LIMITES_TERCERO.denominacionRazonSocial),
    rfc: zRfcOpcional,
    curp: zCurpOpcional,
    correoElectronico: zCorreoOpcional,
    pais: z
      .string({ error: "Selecciona el país" })
      .trim()
      .toUpperCase()
      .refine((v) => /^[A-Z]{3}$/.test(v), "Selecciona el país (clave de 3 letras)"),
    entidadFederativa: opcional(LIMITES_TERCERO.entidadFederativaCatalogo),
    municipio: opcional(LIMITES_TERCERO.municipio),
    colonia: opcional(LIMITES_TERCERO.colonia),
    localidad: opcional(LIMITES_TERCERO.localidad),
    codigoPostal: opcional(LIMITES_TERCERO.codigoPostal),
    calle: zTexto(LIMITES_TERCERO.calle, "La calle es obligatoria"),
    numeroExterior: opcional(LIMITES_TERCERO.numeroExterior),
    numeroInterior: opcional(LIMITES_TERCERO.numeroInterior),
    lada: opcional(LIMITES_TERCERO.lada),
    telefono: opcional(LIMITES_TERCERO.telefono),
  })
  .superRefine((d, ctx) => {
    const esDestinatario = d.tipo === "DESTINATARIO";
    const esNacional = d.nacionalidad === "NACIONAL";
    const error = (campo: keyof typeof d, message: string) => ctx.addIssue({ code: "custom", path: [campo], message });
    const requerido = (campo: keyof typeof d, message: string) => {
      if (!d[campo]) error(campo, message);
    };
    const maximo = (campo: keyof typeof d, max: number) => {
      const valor = d[campo];
      if (typeof valor === "string" && valor.length > max) error(campo, `Máximo ${max} caracteres`);
    };

    // Persona
    if (d.tipoPersona === "FISICA") {
      requerido("nombre", "El nombre es obligatorio para persona física");
      requerido("apellidoPaterno", "El apellido paterno es obligatorio para persona física");
    }
    if (d.tipoPersona === "MORAL" || esDestinatario) {
      requerido(
        "denominacionRazonSocial",
        esDestinatario ? "La denominación o razón social del destinatario es obligatoria" : "La denominación o razón social es obligatoria",
      );
    }
    if (esDestinatario) maximo("denominacionRazonSocial", LIMITES_TERCERO.denominacionDestinatario);

    // RFC y CURP
    if (esNacional || esDestinatario) {
      requerido("rfc", esDestinatario ? "El RFC del destinatario es obligatorio" : "El RFC es obligatorio para terceros nacionales");
    }
    if (d.rfc && esNacional) {
      if (d.tipoPersona === "MORAL" && !esRfcMoral(d.rfc)) error("rfc", "Una persona moral tiene RFC de 12 caracteres");
      if (d.tipoPersona === "FISICA" && esRfcMoral(d.rfc)) error("rfc", "Una persona física tiene RFC de 13 caracteres");
    }
    if (d.curp && !(d.tipoPersona === "FISICA" && esNacional)) {
      error("curp", "La CURP solo aplica a personas físicas nacionales");
    }

    // Correo: obligatorio para fabricante, proveedor y facturador.
    if (!esDestinatario) requerido("correoElectronico", "El correo electrónico es obligatorio");

    // Domicilio
    if (!esNacional && d.pais === "MEX") {
      error("pais", "Si el domicilio está en México, elige la nacionalidad «Nacional» para capturar el domicilio mexicano");
    }
    if (esNacional) {
      if (d.pais !== "MEX") error("pais", "Un tercero nacional debe tener país MEX (México)");
      requerido("entidadFederativa", "Selecciona la entidad federativa");
      requerido("municipio", "El municipio o alcaldía es obligatorio");
      requerido("colonia", "La colonia es obligatoria");
      if (!d.codigoPostal) error("codigoPostal", "El código postal es obligatorio");
      else if (!RE_CP_MX.test(d.codigoPostal)) error("codigoPostal", "El código postal debe tener 5 dígitos");
    }
    if (esDestinatario) {
      requerido("entidadFederativa", "La entidad federativa (estado) es obligatoria");
      requerido("municipio", "El municipio o alcaldía es obligatorio");
      requerido("localidad", "La localidad es obligatoria");
      requerido("colonia", "La colonia es obligatoria");
      requerido("codigoPostal", "El código postal es obligatorio");
      requerido("numeroExterior", "El número exterior es obligatorio");
      maximo("numeroExterior", LIMITES_TERCERO.numeroExteriorDestinatario);
      requerido("numeroInterior", "El número interior es obligatorio para el destinatario (si no tiene, escribe S/N)");
      requerido("telefono", "El teléfono del destinatario es obligatorio");
    } else {
      requerido("entidadFederativa", "La entidad federativa, estado o provincia es obligatoria");
      requerido("numeroExterior", "El número exterior es obligatorio");
    }
    // Estado o provincia de extranjeros (texto libre): tamaño del manual.
    if (!esNacional) {
      maximo("entidadFederativa", esDestinatario ? LIMITES_TERCERO.entidadFederativaDestinatario : LIMITES_TERCERO.entidadFederativa);
    }
  });

export type DatosTercero = z.infer<typeof esquemaTercero>;

/**
 * Deja en null los campos que no aplican según tipo de persona y nacionalidad, para no guardar
 * datos ocultos en el formulario (p. ej. nombre de una persona moral o CURP de un extranjero).
 */
export function datosTerceroParaGuardar(d: DatosTercero) {
  const fisica = d.tipoPersona === "FISICA";
  const esDestinatario = d.tipo === "DESTINATARIO";
  return {
    tipo: d.tipo,
    tipoPersona: d.tipoPersona,
    nacionalidad: d.nacionalidad,
    nombre: fisica ? (d.nombre ?? null) : null,
    apellidoPaterno: fisica ? (d.apellidoPaterno ?? null) : null,
    apellidoMaterno: fisica ? (d.apellidoMaterno ?? null) : null,
    denominacionRazonSocial: !fisica || esDestinatario ? (d.denominacionRazonSocial ?? null) : null,
    rfc: d.rfc ?? null,
    curp: fisica && d.nacionalidad === "NACIONAL" ? (d.curp ?? null) : null,
    correoElectronico: d.correoElectronico ?? null,
    pais: d.pais,
    entidadFederativa: d.entidadFederativa ?? null,
    municipio: d.municipio ?? null,
    colonia: d.colonia ?? null,
    localidad: d.localidad ?? null,
    codigoPostal: d.codigoPostal ?? null,
    calle: d.calle,
    numeroExterior: d.numeroExterior ?? null,
    numeroInterior: d.numeroInterior ?? null,
    lada: d.lada ?? null,
    telefono: d.telefono ?? null,
  };
}

/** Nombre a mostrar de un tercero. */
export function nombreTercero(t: {
  tipoPersona: string;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  denominacionRazonSocial: string | null;
  rfc?: string | null;
}): string {
  if (t.tipoPersona === "MORAL") return t.denominacionRazonSocial ?? t.rfc ?? "(sin nombre)";
  const completo = [t.nombre, t.apellidoPaterno, t.apellidoMaterno].filter(Boolean).join(" ");
  return completo || t.denominacionRazonSocial || t.rfc || "(sin nombre)";
}
