"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ErrorPermiso, exigirRol, obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { AMBIENTES_VUCEM } from "@/lib/constantes";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { zCorreoOpcional, zRfc } from "@/lib/validacion/comunes";
import { borrarCredencial, guardarCredencial } from "@/lib/vucem/credenciales";

const RUTA = "/configuracion/vucem";
const SIN_PERMISO = "Solo un administrador puede modificar la conexión con VUCEM.";

const vacioANull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

const zUrlHttps = z.preprocess(
  vacioANull,
  z
    .string()
    .max(500, "Máximo 500 caracteres")
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "Escribe una URL completa que empiece con https://")
    .nullable(),
);

const zTextoNull = (max: number) => z.preprocess(vacioANull, z.string().max(max, `Máximo ${max} caracteres`).nullable());

const esquemaConfiguracion = z
  .object({
    ambiente: z.enum(AMBIENTES_VUCEM, { error: "Elige el ambiente" }),
    urlSolicitud: zUrlHttps,
    operacionSolicitud: z.preprocess(
      vacioANull,
      z
        .string()
        .max(100, "Máximo 100 caracteres")
        .regex(/^[A-Za-z_][\w.-]*$/, "Solo letras, números, guion bajo, punto o guion; sin espacios ni prefijo (p. ej. registrarSolicitud)")
        .nullable(),
    ),
    namespaceSolicitud: zTextoNull(300),
    soapActionSolicitud: zTextoNull(300),
    urlDigitalizacion: zUrlHttps,
    correoDigitalizacion: zCorreoOpcional,
    confirmarProduccion: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .superRefine((d, ctx) => {
    if (d.ambiente === "PRODUCCION" && !d.confirmarProduccion) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmarProduccion"],
        message: "Confirma que entiendes que en PRODUCCIÓN las solicitudes se presentan ante COFEPRIS.",
      });
    }
  });

const CAMPOS = [
  "ambiente",
  "urlSolicitud",
  "operacionSolicitud",
  "namespaceSolicitud",
  "soapActionSolicitud",
  "urlDigitalizacion",
  "correoDigitalizacion",
] as const;

export async function guardarConfiguracionVucem(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);

    const actual = await db.configuracionVucem.findUnique({ where: { empresaId: ctx.empresa.id } });
    // La confirmación solo se pide al cambiar a PRODUCCIÓN.
    const datosEntrada = actual?.ambiente === "PRODUCCION" ? { ...valores, confirmarProduccion: "on" } : valores;
    const r = esquemaConfiguracion.safeParse(datosEntrada);
    if (!r.success) return { ok: false, errores: erroresDeZod(r.error), valores };
    const d = r.data;

    const nuevo = {
      ambiente: d.ambiente,
      urlSolicitud: d.urlSolicitud,
      operacionSolicitud: d.operacionSolicitud,
      namespaceSolicitud: d.namespaceSolicitud,
      soapActionSolicitud: d.soapActionSolicitud,
      urlDigitalizacion: d.urlDigitalizacion,
      correoDigitalizacion: d.correoDigitalizacion ?? null,
    };
    const cambiados = CAMPOS.filter((c) => (actual?.[c] ?? null) !== nuevo[c]);
    if (actual && cambiados.length === 0) return { ok: true, mensaje: "No hubo cambios.", valores };

    await db.configuracionVucem.upsert({
      where: { empresaId: ctx.empresa.id },
      create: { empresaId: ctx.empresa.id, ...nuevo },
      update: nuevo,
    });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: actual ? "EDITAR" : "CREAR",
      entidad: "ConfiguracionVucem",
      entidadId: ctx.empresa.id,
      detalle: {
        campos: cambiados,
        ...(actual?.ambiente !== nuevo.ambiente ? { ambiente: { antes: actual?.ambiente ?? null, despues: nuevo.ambiente } } : {}),
      },
    });
    revalidatePath(RUTA);
    return { ok: true, mensaje: "Configuración guardada.", valores };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: SIN_PERMISO, valores };
    throw e;
  }
}

const esquemaCredencial = z.object({
  usuarioWs: zRfc,
  password: z
    .string({ error: "Escribe la contraseña de servicios web" })
    .min(1, "Escribe la contraseña de servicios web")
    .max(500, "Máximo 500 caracteres")
    .refine((v) => v.trim() === v, "La contraseña no debe empezar ni terminar con espacios (revisa lo que copiaste)"),
});

export async function guardarCredencialVucem(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  // La contraseña NUNCA regresa al navegador: solo se repuebla el usuario.
  const usuarioWs = String(formData.get("usuarioWs") ?? "");
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);
    const r = esquemaCredencial.safeParse({ usuarioWs, password: formData.get("password") ?? "" });
    if (!r.success) return { ok: false, errores: erroresDeZod(r.error), valores: { usuarioWs } };

    try {
      await guardarCredencial(ctx.empresa.id, r.data.usuarioWs, r.data.password, ctx.usuario.id);
    } catch (e) {
      if (e instanceof Error && /APP_ENCRYPTION_KEY/.test(e.message)) {
        return { ok: false, mensaje: `No se pudo cifrar la contraseña: ${e.message}`, valores: { usuarioWs } };
      }
      throw e;
    }
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "GUARDAR_CREDENCIAL",
      entidad: "CredencialVucem",
      entidadId: ctx.empresa.id,
      detalle: { usuarioWs: r.data.usuarioWs },
    });
    revalidatePath(RUTA);
    return { ok: true, mensaje: "Contraseña de servicios web guardada (cifrada).", valores: { usuarioWs: r.data.usuarioWs } };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: SIN_PERMISO, valores: { usuarioWs } };
    throw e;
  }
}

export async function borrarCredencialVucem(): Promise<EstadoFormulario> {
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);
    const borrada = await borrarCredencial(ctx.empresa.id);
    if (borrada) {
      await registrarBitacora({
        empresaId: ctx.empresa.id,
        usuarioId: ctx.usuario.id,
        accion: "BORRAR_CREDENCIAL",
        entidad: "CredencialVucem",
        entidadId: ctx.empresa.id,
      });
    }
    revalidatePath(RUTA);
    return { ok: true, mensaje: borrada ? "Contraseña de servicios web borrada." : "No había contraseña guardada." };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: SIN_PERMISO };
    throw e;
  }
}
