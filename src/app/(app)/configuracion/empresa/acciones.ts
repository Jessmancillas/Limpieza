"use server";

import { revalidatePath } from "next/cache";

import { ErrorPermiso, exigirRol, obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { esquemaEmpresa } from "@/lib/validacion/empresa";

const CAMPOS_MORAL = ["razonSocial"] as const;
const CAMPOS_FISICA = ["nombre", "apellidoPaterno", "apellidoMaterno", "curp", "actividadProductiva"] as const;

export async function actualizarEmpresa(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  try {
    const ctx = await obtenerContexto();
    exigirRol(ctx, ["ADMIN"]);

    const datos = esquemaEmpresa.safeParse(valores);
    if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };
    const d = datos.data;

    const actual = await db.empresa.findUniqueOrThrow({ where: { id: ctx.empresa.id } });

    if (d.rfc !== actual.rfc) {
      const presentadas = await db.solicitud.count({ where: { empresaId: actual.id, folioVucem: { not: null } } });
      if (presentadas > 0) {
        return {
          ok: false,
          errores: {
            rfc: [`No se puede cambiar el RFC: ya hay ${presentadas} solicitud(es) presentada(s) ante VUCEM con ${actual.rfc}.`],
          },
          valores,
        };
      }
      const otra = await db.empresa.findUnique({ where: { rfc: d.rfc }, select: { id: true } });
      if (otra && otra.id !== actual.id) {
        return { ok: false, errores: { rfc: ["Este RFC ya está registrado en otra empresa."] }, valores };
      }
    }

    // Los opcionales vacíos se guardan como null (para poder borrarlos) y se limpian los campos
    // del otro tipo de persona, que el formulario no muestra.
    const nuevo = {
      rfc: d.rfc,
      tipoPersona: d.tipoPersona,
      razonSocial: d.razonSocial ?? null,
      nombre: d.nombre ?? null,
      apellidoPaterno: d.apellidoPaterno ?? null,
      apellidoMaterno: d.apellidoMaterno ?? null,
      curp: d.curp ?? null,
      actividadProductiva: d.actividadProductiva ?? null,
      correoElectronico: d.correoElectronico,
      telefono: d.telefono ?? null,
      calle: d.calle ?? null,
      numeroExterior: d.numeroExterior ?? null,
      numeroInterior: d.numeroInterior ?? null,
      codigoPostal: d.codigoPostal ?? null,
      colonia: d.colonia ?? null,
      localidad: d.localidad ?? null,
      municipio: d.municipio ?? null,
      entidadFederativa: d.entidadFederativa ?? null,
      pais: d.pais,
    };
    for (const campo of d.tipoPersona === "MORAL" ? CAMPOS_FISICA : CAMPOS_MORAL) nuevo[campo] = null;

    const camposCambiados = (Object.keys(nuevo) as Array<keyof typeof nuevo>).filter((k) => nuevo[k] !== actual[k]);
    if (camposCambiados.length === 0) {
      return { ok: true, mensaje: "No hubo cambios.", valores: aValores(nuevo) };
    }

    await db.empresa.update({ where: { id: actual.id }, data: nuevo });
    await registrarBitacora({
      empresaId: actual.id,
      usuarioId: ctx.usuario.id,
      accion: "ACTUALIZAR",
      entidad: "Empresa",
      entidadId: actual.id,
      detalle: {
        campos: camposCambiados,
        ...(nuevo.rfc !== actual.rfc ? { rfcAnterior: actual.rfc, rfcNuevo: nuevo.rfc } : {}),
      },
    });
    // El nombre y RFC aparecen en el encabezado de todas las páginas.
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Datos de la empresa guardados.", valores: aValores(nuevo) };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: "Solo un administrador puede modificar los datos de la empresa.", valores };
    throw e;
  }
}

function aValores(datos: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v ?? ""]));
}
