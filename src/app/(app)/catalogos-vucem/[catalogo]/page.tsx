import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, EncabezadoPagina, Entrada, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Td, Th, clasesBoton, cx } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { CATALOGOS } from "@/lib/constantes";
import { db } from "@/lib/db";

import { normalizarTexto } from "../csv";
import { ETIQUETA_FUENTE, NOTA_CATALOGO, esCatalogo } from "../info";

import { FormularioAltaClave, FormularioEdicionClave, FormularioImportacion } from "./formularios";

const POR_PAGINA = 100;

type Props = {
  params: Promise<{ catalogo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { catalogo } = await params;
  return { title: esCatalogo(catalogo) ? CATALOGOS[catalogo] : "Catálogo" };
}

export default async function PaginaCatalogo({ params, searchParams }: Props) {
  const { catalogo } = await params;
  if (!esCatalogo(catalogo)) notFound();
  const sp = await searchParams;
  const ctx = await obtenerContexto();
  const esAdmin = ctx.rol === "ADMIN";

  const q = texto(sp.q);
  const estado = texto(sp.estado);
  const editarId = texto(sp.editar);
  const paginaSolicitada = Number.parseInt(texto(sp.pagina) || "1", 10);

  const todos = await db.catalogoVucem.findMany({
    where: { catalogo },
    orderBy: [{ clave: "asc" }],
  });
  const hayPadres = catalogo === "CAT_SUBCLASIF_PRODUCTO" || todos.some((r) => r.padreClave);
  const totalPorConfirmar = todos.filter((r) => r.porConfirmar).length;

  // Búsqueda en memoria: los catálogos son chicos y así se ignoran acentos y mayúsculas.
  const qNorm = normalizarTexto(q);
  const filtrados = todos.filter((r) => {
    if (estado === "por-confirmar" && !r.porConfirmar) return false;
    if (estado === "inactivos" && r.activo) return false;
    if (!qNorm) return true;
    return (
      normalizarTexto(r.clave).includes(qNorm) ||
      normalizarTexto(r.descripcion).includes(qNorm) ||
      (r.padreClave ? normalizarTexto(r.padreClave) === qNorm : false)
    );
  });

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagina = Number.isFinite(paginaSolicitada) ? Math.min(Math.max(paginaSolicitada, 1), paginas) : 1;
  const visibles = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const enlace = (cambios: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | number | null> = { q: q || null, estado: estado || null, pagina: pagina > 1 ? pagina : null };
    for (const [k, v] of Object.entries({ ...base, ...cambios })) {
      if (v !== null && v !== "") p.set(k, String(v));
    }
    const s = p.toString();
    return `/catalogos-vucem/${catalogo}${s ? `?${s}` : ""}`;
  };

  const editando = esAdmin && editarId ? todos.find((r) => r.id === editarId) : undefined;
  const nota = NOTA_CATALOGO[catalogo];

  return (
    <>
      <EncabezadoPagina
        titulo={CATALOGOS[catalogo]}
        descripcion={
          <>
            Catálogo <span className="font-mono">{catalogo}</span> · {todos.length} claves
            {totalPorConfirmar > 0 && ` · ${totalPorConfirmar} por confirmar`}
          </>
        }
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Catálogos VUCEM", href: "/catalogos-vucem" }, { etiqueta: CATALOGOS[catalogo] }]}
      />

      <div className="space-y-6">
        {nota && <Aviso tono="info">{nota}</Aviso>}
        {esAdmin ? (
          <Aviso tono="aviso" titulo="Los catálogos son globales">
            Se comparten entre todas las empresas de esta instalación: cualquier cambio afecta los formularios y
            solicitudes de todas ellas.
          </Aviso>
        ) : (
          <p className="text-sm text-texto-suave">Solo un administrador puede agregar, editar o importar claves.</p>
        )}

        {editando && (
          <Tarjeta titulo={`Editar clave ${editando.clave}`} descripcion={`Fuente: ${ETIQUETA_FUENTE[editando.fuente] ?? editando.fuente}`}>
            <FormularioEdicionClave
              key={editando.id}
              catalogo={catalogo}
              registro={{
                id: editando.id,
                clave: editando.clave,
                descripcion: editando.descripcion,
                padreClave: editando.padreClave,
                activo: editando.activo,
                porConfirmar: editando.porConfirmar,
              }}
              hrefCerrar={enlace({ editar: null })}
            />
          </Tarjeta>
        )}

        {esAdmin && (
          <div className="grid grid-cols-1 gap-4">
            <details className="group rounded-lg border border-borde bg-superficie shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-3 font-semibold marker:hidden">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                Importar CSV
                <span className="ml-2 text-sm font-normal text-texto-suave">clave, descripción [, clave padre]</span>
              </summary>
              <div className="border-t border-borde px-5 py-4">
                <FormularioImportacion catalogo={catalogo} />
              </div>
            </details>
            <details className="group rounded-lg border border-borde bg-superficie shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-3 font-semibold marker:hidden">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                Agregar clave manualmente
              </summary>
              <div className="border-t border-borde px-5 py-4">
                <FormularioAltaClave catalogo={catalogo} />
              </div>
            </details>
          </div>
        )}

        <form method="get" action={`/catalogos-vucem/${catalogo}`} role="search" className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <label htmlFor="q" className="block text-sm font-medium">
              Buscar
            </label>
            <Entrada id="q" name="q" type="search" defaultValue={q} placeholder="Clave o descripción" className="mt-1" />
          </div>
          <div className="basis-48">
            <label htmlFor="estado" className="block text-sm font-medium">
              Mostrar
            </label>
            <Selector id="estado" name="estado" defaultValue={estado} className="mt-1">
              <option value="">Todas</option>
              <option value="por-confirmar">Solo por confirmar</option>
              <option value="inactivos">Solo inactivas</option>
            </Selector>
          </div>
          <button type="submit" className={clasesBoton("secundario")}>
            Buscar
          </button>
          {(q || estado) && (
            <Link href={`/catalogos-vucem/${catalogo}`} className="py-2 text-sm text-primario hover:underline">
              Limpiar
            </Link>
          )}
        </form>

        {filtrados.length === 0 ? (
          <EstadoVacio
            titulo={todos.length === 0 ? "Este catálogo está vacío" : "Sin resultados"}
            descripcion={
              todos.length === 0
                ? "Importa el catálogo oficial en CSV o agrega claves manualmente (requiere rol de administrador)."
                : "Prueba con otra búsqueda o quita los filtros."
            }
          />
        ) : (
          <>
            <p className="text-sm text-texto-suave" aria-live="polite">
              {filtrados.length === todos.length
                ? `${todos.length} claves`
                : `${filtrados.length} de ${todos.length} claves`}
              {paginas > 1 && ` · página ${pagina} de ${paginas}`}
            </p>
            <Tabla>
              <thead>
                <tr>
                  <Th>Clave</Th>
                  <Th>Descripción</Th>
                  {hayPadres && <Th>Clave padre</Th>}
                  <Th>Fuente</Th>
                  <Th>Estado</Th>
                  {esAdmin && (
                    <Th>
                      <span className="sr-only">Acciones</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((r) => (
                  <tr key={r.id} className={cx(!r.activo && "opacity-60", editando?.id === r.id && "bg-primario-suave")}>
                    <Td className="font-mono whitespace-nowrap">{r.clave}</Td>
                    <Td>{r.descripcion}</Td>
                    {hayPadres && <Td className="font-mono">{r.padreClave ?? "—"}</Td>}
                    <Td>
                      <Insignia tono={r.fuente === "IMPORTADO" ? "exito" : r.fuente === "MANUAL" ? "info" : "neutro"}>
                        {ETIQUETA_FUENTE[r.fuente] ?? r.fuente}
                      </Insignia>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.porConfirmar && <Insignia tono="aviso">Por confirmar</Insignia>}
                        {!r.activo && <Insignia>Inactiva</Insignia>}
                        {r.activo && !r.porConfirmar && <Insignia tono="exito">Confirmada</Insignia>}
                      </div>
                    </Td>
                    {esAdmin && (
                      <Td className="text-right">
                        <Link
                          href={enlace({ editar: r.id })}
                          className="text-sm text-primario hover:underline"
                          aria-label={`Editar clave ${r.clave}`}
                        >
                          Editar
                        </Link>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabla>
            {paginas > 1 && (
              <nav aria-label="Paginación" className="flex items-center justify-between gap-3 text-sm">
                {pagina > 1 ? (
                  <Link href={enlace({ pagina: pagina - 1 })} className={clasesBoton("secundario", "sm")}>
                    ← Anterior
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-texto-suave">
                  Página {pagina} de {paginas}
                </span>
                {pagina < paginas ? (
                  <Link href={enlace({ pagina: pagina + 1 })} className={clasesBoton("secundario", "sm")}>
                    Siguiente →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
