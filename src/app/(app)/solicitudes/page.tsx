import Link from "next/link";

import { clasesBoton, cx, EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { ESTADOS_SOLICITUD, ETIQUETA_ESTADO_SOLICITUD, type EstadoSolicitud, type SentidoResolucion } from "@/lib/constantes";
import { db } from "@/lib/db";
import { formatoFecha } from "@/lib/formularios";
import { diasHabilesEntre } from "@/lib/solicitudes/dias-habiles";
import { obtenerDiasInhabiles } from "@/lib/solicitudes/dias-inhabiles-bd";
import { ETIQUETA_SENTIDO, TONO_SENTIDO, etiquetaEstado, textoDiasHabiles, tonoEstado } from "@/lib/solicitudes/presentacion";

function parametro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function Solicitudes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const estadoParam = parametro(sp.estado);
  const estado = (ESTADOS_SOLICITUD as readonly string[]).includes(estadoParam) ? (estadoParam as EstadoSolicitud) : null;
  const q = parametro(sp.q).slice(0, 40);
  const numero = /^\d{1,9}$/.test(q) ? Number(q) : null;

  const [solicitudes, conteos, inhabiles] = await Promise.all([
    db.solicitud.findMany({
      where: {
        empresaId,
        ...(estado ? { estado } : {}),
        ...(q
          ? {
              OR: [
                { folioVucem: { contains: q } },
                { numeroTemporal: { contains: q } },
                ...(numero !== null ? [{ numero }] : []),
              ],
            }
          : {}),
      },
      orderBy: { numero: "desc" },
      take: 200,
      select: {
        id: true,
        numero: true,
        estado: true,
        folioVucem: true,
        fechaPresentacion: true,
        canalPresentacion: true,
        establecimiento: { select: { denominacionRazonSocial: true } },
        _count: { select: { partidas: true } },
        requerimientos: {
          where: { estado: "PENDIENTE" },
          orderBy: { fechaLimite: "asc" },
          take: 1,
          select: { fechaLimite: true },
        },
        resolucion: { select: { sentido: true, numeroPermiso: true, vigenciaHasta: true } },
      },
    }),
    db.solicitud.groupBy({ by: ["estado"], where: { empresaId }, _count: { _all: true } }),
    obtenerDiasInhabiles(),
  ]);
  const conteo = new Map(conteos.map((c) => [c.estado, c._count._all]));
  const total = conteos.reduce((s, c) => s + c._count._all, 0);
  const puedeEditar = ctx.rol !== "CONSULTA";
  const hoy = new Date();

  const hrefFiltro = (e: EstadoSolicitud | null) => {
    const p = new URLSearchParams();
    if (e) p.set("estado", e);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/solicitudes${s ? `?${s}` : ""}`;
  };
  const pestanas: Array<{ e: EstadoSolicitud | null; etiqueta: string; n: number }> = [
    { e: null, etiqueta: "Todas", n: total },
    ...ESTADOS_SOLICITUD.filter((e) => (conteo.get(e) ?? 0) > 0 || e === estado).map((e) => ({
      e,
      etiqueta: ETIQUETA_ESTADO_SOLICITUD[e],
      n: conteo.get(e) ?? 0,
    })),
  ];

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes"
        descripcion="Permisos sanitarios de importación de dispositivos médicos (VUCEM 260211): captura, validación, presentación y seguimiento."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Solicitudes" }]}
        acciones={
          <>
            <EnlaceBoton href="/solicitudes/dias-inhabiles" variante="secundario">
              Días inhábiles
            </EnlaceBoton>
            {puedeEditar && <EnlaceBoton href="/solicitudes/nueva">+ Nueva solicitud</EnlaceBoton>}
          </>
        }
      />

      <nav aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2">
        {pestanas.map((p) => {
          const activa = p.e === estado;
          return (
            <Link
              key={p.e ?? "todas"}
              href={hrefFiltro(p.e)}
              aria-current={activa ? "page" : undefined}
              className={cx(
                "rounded-full border px-3 py-1 text-sm",
                activa ? "border-primario bg-primario-suave text-primario" : "border-borde bg-superficie text-texto-suave hover:text-texto",
              )}
            >
              {p.etiqueta} <span className="text-xs">({p.n})</span>
            </Link>
          );
        })}
      </nav>

      <form action="/solicitudes" role="search" className="mb-4 flex flex-wrap gap-2">
        {estado && <input type="hidden" name="estado" value={estado} />}
        <label htmlFor="q" className="sr-only">
          Buscar por folio o número
        </label>
        <Entrada id="q" name="q" type="search" defaultValue={q} placeholder="Folio VUCEM, número temporal o número de solicitud" className="w-full sm:w-96" />
        <button type="submit" className={clasesBoton("secundario")}>
          Buscar
        </button>
        {q && (
          <Link href={hrefFiltro(estado)} className={clasesBoton("fantasma")}>
            Limpiar
          </Link>
        )}
      </form>

      {solicitudes.length === 0 ? (
        <EstadoVacio
          titulo={q || estado ? "Sin resultados" : "Aún no hay solicitudes"}
          descripcion={
            q || estado
              ? "No hay solicitudes con esos filtros."
              : "Crea una solicitud: eliges el establecimiento, agregas las mercancías desde tu catálogo de productos y la app revisa todo antes de presentarla."
          }
          accion={puedeEditar && !q && !estado && <EnlaceBoton href="/solicitudes/nueva">Crear solicitud</EnlaceBoton>}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Número</Th>
              <Th>Estado</Th>
              <Th>Establecimiento</Th>
              <Th className="text-right">Mercancías</Th>
              <Th>Folio VUCEM</Th>
              <Th>Presentación</Th>
              <Th>Requerimiento pendiente</Th>
              <Th>Resolución</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {solicitudes.map((s) => {
              const req = s.requerimientos[0];
              const dias = req ? diasHabilesEntre(hoy, req.fechaLimite, inhabiles) : null;
              const sentido = s.resolucion?.sentido as SentidoResolucion | undefined;
              return (
                <tr key={s.id}>
                  <Td>
                    <Link href={`/solicitudes/${s.id}`} className="font-medium text-primario hover:underline">
                      Solicitud {s.numero}
                    </Link>
                  </Td>
                  <Td>
                    <Insignia tono={tonoEstado(s.estado)}>{etiquetaEstado(s.estado)}</Insignia>
                  </Td>
                  <Td className="max-w-56">{s.establecimiento?.denominacionRazonSocial ?? <span className="text-texto-suave">—</span>}</Td>
                  <Td className="text-right tabular-nums">{s._count.partidas}</Td>
                  <Td className="font-mono text-xs">{s.folioVucem ?? "—"}</Td>
                  <Td>
                    {s.fechaPresentacion ? (
                      <>
                        {formatoFecha(s.fechaPresentacion)}
                        {s.canalPresentacion && <span className="block text-xs text-texto-suave">{s.canalPresentacion === "WS" ? "Servicio web" : "Portal"}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {req && dias !== null ? (
                      <>
                        {formatoFecha(req.fechaLimite)}
                        <span className="block">
                          <Insignia tono={dias <= 2 ? "peligro" : "aviso"}>{textoDiasHabiles(dias)}</Insignia>
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {sentido ? (
                      <>
                        <Insignia tono={TONO_SENTIDO[sentido]}>{ETIQUETA_SENTIDO[sentido]}</Insignia>
                        {s.resolucion?.numeroPermiso && <span className="block font-mono text-xs">{s.resolucion.numeroPermiso}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
