import "server-only";

import { cache } from "react";

import type { Catalogo } from "@/lib/constantes";
import { db } from "@/lib/db";

export type OpcionCatalogo = {
  clave: string;
  descripcion: string;
  padreClave: string | null;
  porConfirmar: boolean;
};

/** Opciones activas de un catálogo VUCEM, ordenadas por descripción. */
export const obtenerOpcionesCatalogo = cache(async (catalogo: Catalogo): Promise<OpcionCatalogo[]> => {
  return db.catalogoVucem.findMany({
    where: { catalogo, activo: true },
    select: { clave: true, descripcion: true, padreClave: true, porConfirmar: true },
    orderBy: [{ descripcion: "asc" }],
  });
});

/** Descripción de una clave ("—" si no hay clave; la clave misma si no está en el catálogo). */
export async function describirClave(catalogo: Catalogo, clave: string | null | undefined): Promise<string> {
  if (!clave) return "—";
  const opciones = await obtenerOpcionesCatalogo(catalogo);
  const opcion = opciones.find((o) => o.clave === clave);
  return opcion ? `${opcion.descripcion} (${opcion.clave})` : clave;
}

/** Mapa clave → descripción para pintar tablas sin consultas repetidas. */
export async function mapaCatalogo(catalogo: Catalogo): Promise<Map<string, string>> {
  const opciones = await obtenerOpcionesCatalogo(catalogo);
  return new Map(opciones.map((o) => [o.clave, o.descripcion]));
}
