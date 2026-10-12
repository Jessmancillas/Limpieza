import Link from "next/link";

import { Aviso, cx, EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { mapaCatalogo } from "@/lib/catalogos";
import { ETIQUETA_TIPO_TERCERO, TIPOS_TERCERO, type TipoTercero } from "@/lib/constantes";
import { db } from "@/lib/db";
import { nombreTercero } from "@/lib/validacion/tercero";

const TITULO_PESTANA: Record<TipoTercero, string> = {
  FABRICANTE: "Fabricantes",
  PROVEEDOR: "Proveedores",
  DESTINATARIO: "Destinatarios",
  FACTURADOR: "Facturadores",
};

function textoParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function Terceros({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const tipoParam = textoParam(sp.tipo);
  const tipo = (TIPOS_TERCERO as readonly string[]).includes(tipoParam) ? (tipoParam as TipoTercero) : null;
  const q = textoParam(sp.q).slice(0, 100);
  const empresaId = ctx.empresa.id;

  const [terceros, conteos, paises] = await Promise.all([
    db.tercero.findMany({
      where: {
        empresaId,
        ...(tipo ? { tipo } : {}),
        ...(q
          ? {
              OR: [
                { denominacionRazonSocial: { contains: q } },
                { nombre: { contains: q } },
                { apellidoPaterno: { contains: q } },
                { rfc: { contains: q.toUpperCase() } },
                { correoElectronico: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: [{ activo: "desc" }, { denominacionRazonSocial: "asc" }, { nombre: "asc" }],
    }),
    db.tercero.groupBy({ by: ["tipo"], where: { empresaId }, _count: { _all: true } }),
    mapaCatalogo("CAT_PAIS"),
  ]);
  const conteo = new Map(conteos.map((c) => [c.tipo, c._count._all]));
  const total = conteos.reduce((s, c) => s + c._count._all, 0);
  const puedeEditar = ctx.rol !== "CONSULTA";
  const hrefNuevo = `/terceros/nuevo${tipo ? `?tipo=${tipo}` : ""}`;
  const hrefPestana = (t: TipoTercero | null) => {
    const p = new URLSearchParams();
    if (t) p.set("tipo", t);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/terceros${s ? `?${s}` : ""}`;
  };

  const pestanas: Array<{ t: TipoTercero | null; etiqueta: string; n: number }> = [
    { t: null, etiqueta: "Todos", n: total },
    ...TIPOS_TERCERO.map((t) => ({ t, etiqueta: TITULO_PESTANA[t], n: conteo.get(t) ?? 0 })),
  ];

  return (
    <>
      <EncabezadoPagina
        titulo={tipo ? TITULO_PESTANA[tipo] : "Terceros"}
        descripcion="Fabricantes, proveedores, destinatarios y facturadores que se repiten en las solicitudes."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Terceros", href: "/terceros" }, ...(tipo ? [{ etiqueta: TITULO_PESTANA[tipo] }] : [])]}
        acciones={
          puedeEditar && (
            <EnlaceBoton href={hrefNuevo}>+ Nuevo {tipo ? ETIQUETA_TIPO_TERCERO[tipo].split(" ")[0].toLowerCase() : "tercero"}</EnlaceBoton>
          )
        }
      />
      {sp.eliminado && (
        <div className="mb-4">
          <Aviso tono="exito">Tercero eliminado.</Aviso>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Tipo de tercero" className="flex flex-wrap gap-1">
          {pestanas.map((p) => {
            const activa = p.t === tipo;
            return (
              <Link
                key={p.etiqueta}
                href={hrefPestana(p.t)}
                aria-current={activa ? "page" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1 text-sm",
                  activa ? "border-primario bg-primario-suave font-medium text-primario" : "border-borde bg-superficie hover:bg-fondo",
                )}
              >
                {p.etiqueta} <span className="text-xs text-texto-suave">({p.n})</span>
              </Link>
            );
          })}
        </nav>
        <form action="/terceros" className="flex gap-2" role="search">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <label htmlFor="q" className="sr-only">
            Buscar tercero
          </label>
          <Entrada id="q" name="q" type="search" defaultValue={q} placeholder="Nombre, RFC o correo" className="w-56" />
          <button type="submit" className="rounded-md border border-borde bg-superficie px-3 text-sm hover:bg-fondo">
            Buscar
          </button>
        </form>
      </div>

      {terceros.length === 0 ? (
        <EstadoVacio
          titulo={q ? "Sin resultados" : `Aún no hay ${tipo ? TITULO_PESTANA[tipo].toLowerCase() : "terceros"}`}
          descripcion={
            q
              ? "Prueba con otro nombre, RFC o correo."
              : "Captura una sola vez los datos del fabricante, proveedor, destinatario o facturador y elígelos en cada solicitud."
          }
          accion={puedeEditar && !q && <EnlaceBoton href={hrefNuevo}>Dar de alta</EnlaceBoton>}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre o razón social</Th>
              {!tipo && <Th>Tipo</Th>}
              <Th>Persona</Th>
              <Th>RFC</Th>
              <Th>País</Th>
              <Th>Correo</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {terceros.map((t) => (
              <tr key={t.id} className={t.activo ? undefined : "text-texto-suave"}>
                <Td>
                  <Link href={`/terceros/${t.id}`} className="font-medium text-primario hover:underline">
                    {nombreTercero(t)}
                  </Link>
                </Td>
                {!tipo && <Td>{ETIQUETA_TIPO_TERCERO[t.tipo as TipoTercero] ?? t.tipo}</Td>}
                <Td>
                  {t.tipoPersona === "FISICA" ? "Física" : "Moral"}
                  <span className="block text-xs text-texto-suave">{t.nacionalidad === "NACIONAL" ? "Nacional" : "Extranjero"}</span>
                </Td>
                <Td className="font-mono text-xs">{t.rfc ?? "—"}</Td>
                <Td>{paises.get(t.pais) ?? t.pais}</Td>
                <Td className="break-all">{t.correoElectronico ?? "—"}</Td>
                <Td>{t.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
