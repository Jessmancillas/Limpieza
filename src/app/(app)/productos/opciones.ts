import "server-only";

import { obtenerOpcionesCatalogo } from "@/lib/catalogos";
import { db } from "@/lib/db";
import { nombreTercero } from "@/lib/validacion/tercero";

import type { OpcionesProducto } from "./formulario";

/**
 * Opciones de catálogos para el formulario de productos. Los fabricantes son los terceros
 * FABRICANTE activos de la empresa (más el fabricante actual aunque esté inactivo).
 */
export async function cargarOpcionesProducto(empresaId: string, fabricanteActualId?: string | null): Promise<OpcionesProducto> {
  const [clasificacion, subclasificacion, tipoProducto, formaFarmaceutica, estadoFisico, unidadMedida, pais, usoEspecifico, terceros] =
    await Promise.all([
      obtenerOpcionesCatalogo("CAT_CLASIF_PRODUCTO"),
      obtenerOpcionesCatalogo("CAT_SUBCLASIF_PRODUCTO"),
      obtenerOpcionesCatalogo("CAT_TIPO_PRODUCTO"),
      obtenerOpcionesCatalogo("CAT_FORMA_FARMACEUTICA"),
      obtenerOpcionesCatalogo("CAT_ESTADO_FISICO"),
      obtenerOpcionesCatalogo("CAT_UNIDAD_MEDIDA"),
      obtenerOpcionesCatalogo("CAT_PAIS"),
      obtenerOpcionesCatalogo("CAT_USO_ESPECIFICO"),
      db.tercero.findMany({
        where: {
          empresaId,
          tipo: "FABRICANTE",
          OR: [{ activo: true }, ...(fabricanteActualId ? [{ id: fabricanteActualId }] : [])],
        },
        select: {
          id: true,
          tipoPersona: true,
          nombre: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          denominacionRazonSocial: true,
          pais: true,
          activo: true,
        },
      }),
    ]);

  const fabricantes = terceros
    .map((t) => ({ id: t.id, nombre: nombreTercero(t), pais: t.pais, activo: t.activo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return { clasificacion, subclasificacion, tipoProducto, formaFarmaceutica, estadoFisico, unidadMedida, pais, usoEspecifico, fabricantes };
}
