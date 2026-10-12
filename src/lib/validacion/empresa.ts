import { z } from "zod";

import {
  esRfcMoral,
  zCorreo,
  zCurpOpcional,
  zRfc,
  zTexto,
  zTextoOpcional,
} from "./comunes";

/** Datos del solicitante (empresa importadora) tal como están registrados en VUCEM. */
export const esquemaEmpresa = z
  .object({
    rfc: zRfc,
    tipoPersona: z.enum(["MORAL", "FISICA"], { error: "Selecciona el tipo de persona" }),
    razonSocial: zTextoOpcional(254),
    nombre: zTextoOpcional(200),
    apellidoPaterno: zTextoOpcional(200),
    apellidoMaterno: zTextoOpcional(200),
    curp: zCurpOpcional,
    actividadProductiva: zTextoOpcional(200),
    correoElectronico: zCorreo,
    telefono: zTextoOpcional(30),
    calle: zTextoOpcional(120),
    numeroExterior: zTextoOpcional(55),
    numeroInterior: zTextoOpcional(55),
    codigoPostal: zTextoOpcional(12),
    colonia: zTextoOpcional(120),
    localidad: zTextoOpcional(120),
    municipio: zTextoOpcional(120),
    entidadFederativa: zTextoOpcional(60),
    pais: z.string().trim().length(3).default("MEX"),
  })
  .superRefine((d, ctx) => {
    if (d.tipoPersona === "MORAL") {
      if (!d.razonSocial) ctx.addIssue({ code: "custom", path: ["razonSocial"], message: "La razón social es obligatoria" });
      if (!esRfcMoral(d.rfc)) ctx.addIssue({ code: "custom", path: ["rfc"], message: "Una persona moral tiene RFC de 12 caracteres" });
    } else {
      if (!d.nombre) ctx.addIssue({ code: "custom", path: ["nombre"], message: "El nombre es obligatorio" });
      if (!d.apellidoPaterno) ctx.addIssue({ code: "custom", path: ["apellidoPaterno"], message: "El apellido paterno es obligatorio" });
      if (esRfcMoral(d.rfc)) ctx.addIssue({ code: "custom", path: ["rfc"], message: "Una persona física tiene RFC de 13 caracteres" });
    }
  });

export type DatosEmpresa = z.infer<typeof esquemaEmpresa>;

export const esquemaRegistroUsuario = z.object({
  nombreUsuario: zTexto(120, "Tu nombre es obligatorio"),
  email: zCorreo,
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200),
});

/** Nombre a mostrar de una empresa. */
export function nombreEmpresa(e: {
  tipoPersona: string;
  razonSocial: string | null;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  rfc: string;
}): string {
  if (e.tipoPersona === "MORAL") return e.razonSocial ?? e.rfc;
  return [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(" ") || e.rfc;
}
