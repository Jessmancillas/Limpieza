"use server";

import { redirect } from "next/navigation";

import { requerirUsuario } from "@/lib/auth/contexto";
import { cambiarEmpresaActivaDeSesion } from "@/lib/auth/session";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { esquemaEmpresa } from "@/lib/validacion/empresa";

export async function crearEmpresa(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const sesion = await requerirUsuario();
  const valores = formDataAObjeto(formData);
  const datos = esquemaEmpresa.safeParse(valores);
  if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };

  if (await db.empresa.findUnique({ where: { rfc: datos.data.rfc } })) {
    return { ok: false, errores: { rfc: ["Este RFC ya está registrado. Pide acceso a su administrador."] }, valores };
  }

  const empresa = await db.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({ data: datos.data });
    await tx.membresia.create({ data: { usuarioId: sesion.usuarioId, empresaId: empresa.id, rol: "ADMIN" } });
    await tx.configuracionVucem.create({ data: { empresaId: empresa.id, correoDigitalizacion: empresa.correoElectronico } });
    return empresa;
  });
  await cambiarEmpresaActivaDeSesion(sesion.id, empresa.id);
  await registrarBitacora({ usuarioId: sesion.usuarioId, empresaId: empresa.id, accion: "CREAR", entidad: "Empresa", entidadId: empresa.id });
  redirect("/");
}
