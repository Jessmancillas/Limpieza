import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, EncabezadoPagina, Insignia, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { CATALOGOS, type Catalogo } from "@/lib/constantes";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Catálogos VUCEM" };

type Conteo = { total: number; activos: number; porConfirmar: number };

export default async function PaginaCatalogos() {
  const ctx = await obtenerContexto();
  const grupos = await db.catalogoVucem.groupBy({
    by: ["catalogo", "porConfirmar", "activo"],
    _count: { _all: true },
  });

  const conteos = new Map<string, Conteo>();
  for (const g of grupos) {
    const c = conteos.get(g.catalogo) ?? { total: 0, activos: 0, porConfirmar: 0 };
    const n = g._count._all;
    c.total += n;
    if (g.activo) c.activos += n;
    if (g.porConfirmar) c.porConfirmar += n;
    conteos.set(g.catalogo, c);
  }

  const catalogos = Object.entries(CATALOGOS) as Array<[Catalogo, string]>;
  const totalPorConfirmar = catalogos.reduce((s, [clave]) => s + (conteos.get(clave)?.porConfirmar ?? 0), 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogos VUCEM"
        descripcion="Claves que pide el servicio web 260211 (aduanas, países, unidades de medida, clasificación del producto…). Se usan en los formularios de productos, terceros, establecimientos y solicitudes."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Catálogos VUCEM" }]}
      />

      <div className="space-y-6">
        <Aviso tono="aviso" titulo="Claves internas de VUCEM">
          Varias claves (clasificación, subclasificación y tipo de producto, uso específico, estado físico, forma
          farmacéutica, tipo de documento) son identificadores internos de VUCEM que no se publican. La app trae solo
          los valores de ejemplo del manual, marcados como <strong>por confirmar</strong>. Antes de presentar
          solicitudes reales, importa cada catálogo oficial en CSV (columnas <span className="font-mono">clave,descripcion[,padreClave]</span>)
          {ctx.rol === "ADMIN" ? " desde la página de cada catálogo." : "; pídeselo a un administrador."}
        </Aviso>

        {totalPorConfirmar > 0 && (
          <p className="text-sm text-texto-suave">
            Hay {totalPorConfirmar} claves por confirmar en total. «Por confirmar» significa que la clave no se ha
            verificado contra el catálogo oficial; puedes usarla, pero revisa que VUCEM la acepte.
          </p>
        )}

        <Tabla>
          <thead>
            <tr>
              <Th>Catálogo</Th>
              <Th className="hidden sm:table-cell">Nombre técnico</Th>
              <Th className="text-right">Claves</Th>
              <Th className="text-right">Activas</Th>
              <Th>Por confirmar</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {catalogos.map(([clave, nombre]) => {
              const c = conteos.get(clave) ?? { total: 0, activos: 0, porConfirmar: 0 };
              return (
                <tr key={clave}>
                  <Td>
                    <Link href={`/catalogos-vucem/${clave}`} className="font-medium text-primario hover:underline">
                      {nombre}
                    </Link>
                    <span className="block font-mono text-xs text-texto-suave sm:hidden">{clave}</span>
                  </Td>
                  <Td className="hidden font-mono text-xs text-texto-suave sm:table-cell">{clave}</Td>
                  <Td className="text-right tabular-nums">{c.total}</Td>
                  <Td className="text-right tabular-nums">{c.activos}</Td>
                  <Td>
                    {c.total === 0 ? (
                      <Insignia tono="peligro">Vacío: importar</Insignia>
                    ) : c.porConfirmar > 0 ? (
                      <Insignia tono="aviso">
                        {c.porConfirmar === c.total ? "Todas" : c.porConfirmar} por confirmar
                      </Insignia>
                    ) : (
                      <Insignia tono="exito">Confirmado</Insignia>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      </div>
    </>
  );
}
