"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { hashPassword, verificarPassword } from "@/lib/auth/password";
import { crearSesion } from "@/lib/auth/session";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { esquemaEmpresa, esquemaRegistroUsuario } from "@/lib/validacion/empresa";

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});

// Retraso fijo para dificultar ataques de fuerza bruta y no revelar si el correo existe.
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function iniciarSesion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  const datos = esquemaLogin.safeParse(valores);
  if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };

  const usuario = await db.usuario.findUnique({ where: { email: datos.data.email } });
  const valido = usuario?.activo && (await verificarPassword(datos.data.password, usuario.passwordHash));
  if (!usuario || !valido) {
    await esperar(400);
    return { ok: false, mensaje: "Correo o contraseña incorrectos.", valores: { email: datos.data.email } };
  }

  const membresia = await db.membresia.findFirst({ where: { usuarioId: usuario.id }, orderBy: { creadoEn: "asc" } });
  await crearSesion(usuario.id, membresia?.empresaId ?? null);
  await registrarBitacora({ usuarioId: usuario.id, empresaId: membresia?.empresaId, accion: "INICIO_SESION", entidad: "Usuario", entidadId: usuario.id });
  redirect("/");
}

/** El registro abierto solo se permite si no hay usuarios o si PERMITIR_REGISTRO=true. */
export async function registroPermitido(): Promise<boolean> {
  if (process.env.PERMITIR_REGISTRO === "true") return true;
  return (await db.usuario.count()) === 0;
}

export async function registrarse(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  delete valores.password;
  if (!(await registroPermitido())) {
    return { ok: false, mensaje: "El registro está cerrado. Pide a un administrador que te dé acceso." };
  }

  const usuarioDatos = esquemaRegistroUsuario.safeParse(formDataAObjeto(formData));
  const empresaDatos = esquemaEmpresa.safeParse(formDataAObjeto(formData));
  if (!usuarioDatos.success || !empresaDatos.success) {
    return {
      ok: false,
      errores: {
        ...(usuarioDatos.success ? {} : erroresDeZod(usuarioDatos.error)),
        ...(empresaDatos.success ? {} : erroresDeZod(empresaDatos.error)),
      },
      valores,
    };
  }

  const { nombreUsuario, email, password } = usuarioDatos.data;
  if (await db.usuario.findUnique({ where: { email } })) {
    return { ok: false, errores: { email: ["Ya existe una cuenta con este correo"] }, valores };
  }
  if (await db.empresa.findUnique({ where: { rfc: empresaDatos.data.rfc } })) {
    return { ok: false, errores: { rfc: ["Este RFC ya está registrado. Pide acceso a su administrador."] }, valores };
  }

  const passwordHash = await hashPassword(password);
  const { usuario, empresa } = await db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({ data: { email, nombre: nombreUsuario, passwordHash } });
    const empresa = await tx.empresa.create({ data: empresaDatos.data });
    await tx.membresia.create({ data: { usuarioId: usuario.id, empresaId: empresa.id, rol: "ADMIN" } });
    await tx.configuracionVucem.create({ data: { empresaId: empresa.id, correoDigitalizacion: empresa.correoElectronico } });
    return { usuario, empresa };
  });

  await crearSesion(usuario.id, empresa.id);
  await registrarBitacora({ usuarioId: usuario.id, empresaId: empresa.id, accion: "REGISTRO", entidad: "Empresa", entidadId: empresa.id });
  redirect("/");
}
