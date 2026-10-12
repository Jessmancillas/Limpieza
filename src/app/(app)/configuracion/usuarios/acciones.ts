"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ErrorPermiso, exigirRol, obtenerContexto } from "@/lib/auth/contexto";
import { hashPassword, verificarPassword } from "@/lib/auth/password";
import { registrarBitacora } from "@/lib/bitacora";
import { ETIQUETA_ROL, ROLES } from "@/lib/constantes";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { zCorreo, zTextoOpcional } from "@/lib/validacion/comunes";

import { generarPasswordTemporal } from "./password-temporal";

const RUTA = "/configuracion/usuarios";
const MENSAJE_PERMISO = "Solo un administrador puede administrar los usuarios de la empresa.";

export type EstadoAltaMiembro = EstadoFormulario & {
  /** Contraseña temporal del usuario recién creado. Solo viaja en esta respuesta; no se guarda. */
  passwordTemporal?: string;
  correoNuevo?: string;
};

const zRol = z.enum(ROLES, { error: "Selecciona un rol válido" });

const esquemaAlta = z.object({
  email: zCorreo,
  nombre: zTextoOpcional(120),
  rol: zRol,
});

export async function agregarMiembro(_previo: EstadoAltaMiembro, formData: FormData): Promise<EstadoAltaMiembro> {
  const valores = formDataAObjeto(formData);
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);
    const datos = esquemaAlta.safeParse(valores);
    if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };
    const { email, nombre, rol } = datos.data;
    const empresaId = ctx.empresa.id;

    const existente = await db.usuario.findUnique({ where: { email }, select: { id: true, nombre: true, activo: true } });
    if (existente) {
      const yaEsMiembro = await db.membresia.findUnique({
        where: { usuarioId_empresaId: { usuarioId: existente.id, empresaId } },
      });
      if (yaEsMiembro) return { ok: false, errores: { email: ["Este usuario ya es miembro de la empresa."] }, valores };

      const membresia = await db.membresia.create({ data: { usuarioId: existente.id, empresaId, rol } });
      await registrarBitacora({
        empresaId,
        usuarioId: ctx.usuario.id,
        accion: "AGREGAR_MIEMBRO",
        entidad: "Membresia",
        entidadId: membresia.id,
        detalle: { email, rol, usuarioNuevo: false },
      });
      revalidatePath(RUTA);
      return {
        ok: true,
        mensaje:
          `${existente.nombre} (${email}) ya tenía cuenta: se agregó a la empresa como ${ETIQUETA_ROL[rol]}. ` +
          (existente.activo ? "Entra con su contraseña de siempre." : "Atención: su cuenta está desactivada y no podrá entrar."),
      };
    }

    if (!nombre) {
      return {
        ok: false,
        errores: { nombre: ["No existe una cuenta con ese correo: escribe el nombre para crearla."] },
        valores,
      };
    }

    const passwordTemporal = generarPasswordTemporal(16);
    const passwordHash = await hashPassword(passwordTemporal);
    const { usuario, membresia } = await db.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({ data: { email, nombre, passwordHash } });
      const membresia = await tx.membresia.create({ data: { usuarioId: usuario.id, empresaId, rol } });
      return { usuario, membresia };
    });
    await registrarBitacora({
      empresaId,
      usuarioId: ctx.usuario.id,
      accion: "CREAR_USUARIO",
      entidad: "Usuario",
      entidadId: usuario.id,
      detalle: { email, nombre, rol, membresiaId: membresia.id, usuarioNuevo: true },
    });
    revalidatePath(RUTA);
    return {
      ok: true,
      mensaje: `Se creó la cuenta de ${nombre} y se agregó a la empresa como ${ETIQUETA_ROL[rol]}.`,
      passwordTemporal,
      correoNuevo: email,
    };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: MENSAJE_PERMISO, valores };
    throw e;
  }
}

/** Membresía de la empresa activa (el id viene del cliente y se verifica contra la empresa). */
async function membresiaDeEmpresa(id: string, empresaId: string) {
  return db.membresia.findFirst({
    where: { id, empresaId },
    include: { usuario: { select: { id: true, email: true, nombre: true } } },
  });
}

const esquemaRol = z.object({ membresiaId: z.string().min(1), rol: zRol });

export async function cambiarRol(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);
    const datos = esquemaRol.safeParse(formDataAObjeto(formData));
    if (!datos.success) return { ok: false, mensaje: "Selecciona un rol válido." };
    const { membresiaId, rol } = datos.data;
    const empresaId = ctx.empresa.id;

    const resultado = await db.$transaction(async (tx) => {
      const membresia = await tx.membresia.findFirst({ where: { id: membresiaId, empresaId } });
      if (!membresia) return { error: "El miembro ya no pertenece a la empresa." } as const;
      if (membresia.rol === rol) return { sinCambios: true } as const;
      if (membresia.rol === "ADMIN") {
        const admins = await tx.membresia.count({ where: { empresaId, rol: "ADMIN" } });
        if (admins <= 1) return { error: "La empresa debe tener al menos un administrador. Nombra a otro antes de cambiar este rol." } as const;
      }
      await tx.membresia.update({ where: { id: membresia.id }, data: { rol } });
      return { anterior: membresia.rol, usuarioId: membresia.usuarioId } as const;
    });
    if ("error" in resultado) return { ok: false, mensaje: resultado.error };
    if ("sinCambios" in resultado) return { ok: true, mensaje: "Sin cambios." };

    const miembro = await membresiaDeEmpresa(membresiaId, empresaId);
    await registrarBitacora({
      empresaId,
      usuarioId: ctx.usuario.id,
      accion: "CAMBIAR_ROL",
      entidad: "Membresia",
      entidadId: membresiaId,
      detalle: { email: miembro?.usuario.email, rolAnterior: resultado.anterior, rolNuevo: rol },
    });
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Rol actualizado." };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: MENSAJE_PERMISO };
    throw e;
  }
}

export async function quitarMiembro(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);
    const membresiaId = String(formData.get("membresiaId") ?? "");
    const empresaId = ctx.empresa.id;

    const resultado = await db.$transaction(async (tx) => {
      const miembro = await tx.membresia.findFirst({
        where: { id: membresiaId, empresaId },
        include: { usuario: { select: { email: true, nombre: true } } },
      });
      if (!miembro) return { error: "El miembro ya no pertenece a la empresa." } as const;
      if (miembro.rol === "ADMIN") {
        const admins = await tx.membresia.count({ where: { empresaId, rol: "ADMIN" } });
        if (admins <= 1) {
          return {
            error:
              miembro.usuarioId === ctx.usuario.id
                ? "No puedes quitarte: eres el único administrador. Nombra a otro administrador primero."
                : "No se puede quitar al único administrador de la empresa.",
          } as const;
        }
      }
      await tx.membresia.delete({ where: { id: miembro.id } });
      return { miembro } as const;
    });
    if ("error" in resultado) return { ok: false, mensaje: resultado.error };
    const { miembro } = resultado;

    await registrarBitacora({
      empresaId,
      usuarioId: ctx.usuario.id,
      accion: "QUITAR_MIEMBRO",
      entidad: "Membresia",
      entidadId: miembro.id,
      detalle: { email: miembro.usuario.email, nombre: miembro.usuario.nombre, rol: miembro.rol },
    });
    revalidatePath("/", "layout");
    if (miembro.usuarioId !== ctx.usuario.id) {
      return { ok: true, mensaje: `Se quitó a ${miembro.usuario.nombre} de la empresa.` };
    }
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: MENSAJE_PERMISO };
    throw e;
  }
  // Ya no tiene acceso a esta empresa: se le lleva a otra (o a crear una).
  redirect("/");
}

const esquemaPassword = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual"),
    nueva: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200, "Máximo 200 caracteres"),
    confirmacion: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.nueva !== d.confirmacion) {
      ctx.addIssue({ code: "custom", path: ["confirmacion"], message: "La confirmación no coincide con la nueva contraseña" });
    }
    if (d.nueva === d.actual) {
      ctx.addIssue({ code: "custom", path: ["nueva"], message: "La nueva contraseña debe ser distinta de la actual" });
    }
  });

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cambiarMiPassword(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  // Nunca se regresan las contraseñas al cliente (valores vacío).
  const datos = esquemaPassword.safeParse(formDataAObjeto(formData));
  if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error) };

  const usuario = await db.usuario.findUniqueOrThrow({ where: { id: ctx.usuario.id }, select: { id: true, passwordHash: true } });
  if (!(await verificarPassword(datos.data.actual, usuario.passwordHash))) {
    await esperar(400);
    return { ok: false, errores: { actual: ["La contraseña actual no es correcta"] } };
  }

  const passwordHash = await hashPassword(datos.data.nueva);
  await db.$transaction([
    db.usuario.update({ where: { id: usuario.id }, data: { passwordHash } }),
    // Por seguridad se cierran las demás sesiones abiertas del usuario.
    db.sesion.deleteMany({ where: { usuarioId: usuario.id, id: { not: ctx.sesionId } } }),
  ]);
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: usuario.id,
    accion: "CAMBIAR_CONTRASENA",
    entidad: "Usuario",
    entidadId: usuario.id,
  });
  return { ok: true, mensaje: "Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos." };
}
