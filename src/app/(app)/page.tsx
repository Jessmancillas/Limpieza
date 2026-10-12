import Link from "next/link";

import { cx, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { ESTADOS_SOLICITUD, ETIQUETA_TIPO_DOCUMENTO, type TipoDocumento } from "@/lib/constantes";
import { formatoFecha } from "@/lib/formularios";
import { etiquetaEstado, textoDiasHabiles, tonoEstado } from "@/lib/solicitudes/presentacion";
import { cargarTablero, DIAS_DOCUMENTO_POR_VENCER, DIAS_PERMISO_POR_VENCER, DIAS_REGISTRO_POR_VENCER } from "@/lib/solicitudes/tablero";

function textoDias(dias: number | null): string {
  if (dias === null) return "";
  if (dias < 0) return `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoy";
  return `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
}

function ListaVacia({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-texto-suave">{children}</p>;
}

export default async function Tablero() {
  const ctx = await obtenerContexto();
  const t = await cargarTablero(ctx.empresa.id);
  const puedeEditar = ctx.rol !== "CONSULTA";
  const e = ctx.empresa;

  const empresaCompleta = !!(e.correoElectronico && e.calle && e.codigoPostal && e.municipio && e.entidadFederativa);
  const mostrarGuia = t.totales.establecimientos === 0 || t.totales.productos === 0;
  const pasos: Array<{ titulo: string; descripcion: string; href: string; hecho: boolean }> = [
    {
      titulo: "Completa los datos de tu empresa",
      descripcion: "RFC, razón social y domicilio fiscal tal como están registrados en VUCEM.",
      href: "/configuracion/empresa",
      hecho: empresaCompleta,
    },
    {
      titulo: "Da de alta tu establecimiento",
      descripcion: "Domicilio del almacén, SCIAN, responsable sanitario y licencia o aviso de funcionamiento.",
      href: "/establecimientos/nuevo",
      hecho: t.totales.establecimientos > 0,
    },
    {
      titulo: "Productos y fabricantes",
      descripcion: "Dispositivos médicos con fracción arancelaria, registro sanitario y su fabricante.",
      href: t.totales.fabricantes === 0 ? "/terceros/nuevo?tipo=FABRICANTE" : "/productos/nuevo",
      hecho: t.totales.productos > 0 && t.totales.fabricantes > 0,
    },
    {
      titulo: "Sube documentos",
      descripcion: "Licencia o aviso, aviso de responsable y registros sanitarios; la app los convierte al formato de VUCEM.",
      href: "/documentos/nuevo",
      hecho: t.totales.documentos > 0,
    },
    {
      titulo: "Crea tu solicitud",
      descripcion: "Elige el establecimiento, agrega mercancías y revisa la validación previa.",
      href: "/solicitudes/nueva",
      hecho: t.totales.solicitudes > 0,
    },
    {
      titulo: "Configura la conexión VUCEM",
      descripcion: "Contraseña de servicios web para enviar por servicio web (opcional si presentas en el portal).",
      href: "/configuracion/vucem",
      hecho: t.totales.credencialVucem,
    },
  ];

  const estadosConConteo = ESTADOS_SOLICITUD.filter((s) => (t.conteos.get(s) ?? 0) > 0);

  return (
    <>
      <EncabezadoPagina
        titulo={`Hola, ${ctx.usuario.nombre}`}
        descripcion="Resumen de tus permisos sanitarios de importación (VUCEM 260211)."
        acciones={
          puedeEditar && (
            <>
              <EnlaceBoton href="/solicitudes/nueva">+ Nueva solicitud</EnlaceBoton>
              <EnlaceBoton href="/documentos/nuevo" variante="secundario">
                Subir documento
              </EnlaceBoton>
              <EnlaceBoton href="/productos/nuevo" variante="secundario">
                Nuevo producto
              </EnlaceBoton>
            </>
          )
        }
      />

      <div className="space-y-6">
        {mostrarGuia && (
          <Tarjeta titulo="Primeros pasos" descripcion="Captura una vez tus catálogos y después cada solicitud toma minutos.">
            <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pasos.map((p, i) => (
                <li key={p.titulo}>
                  <Link
                    href={p.href}
                    className={cx(
                      "flex h-full gap-3 rounded-md border p-3 text-sm hover:border-primario",
                      p.hecho ? "border-borde bg-fondo" : "border-borde bg-superficie",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        p.hecho ? "bg-exito-suave text-exito" : "bg-primario-suave text-primario",
                      )}
                    >
                      {p.hecho ? "✓" : i + 1}
                    </span>
                    <span>
                      <span className="block font-medium">
                        {i + 1}. {p.titulo}
                        {p.hecho && <span className="sr-only"> (completado)</span>}
                      </span>
                      <span className="block text-texto-suave">{p.descripcion}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Tarjeta>
        )}

        <section aria-labelledby="titulo-estados">
          <h2 id="titulo-estados" className="sr-only">
            Solicitudes por estado
          </h2>
          {estadosConConteo.length === 0 ? (
            <Tarjeta>
              <ListaVacia>
                Aún no hay solicitudes.{" "}
                {puedeEditar && (
                  <Link href="/solicitudes/nueva" className="text-primario hover:underline">
                    Crea la primera
                  </Link>
                )}
              </ListaVacia>
            </Tarjeta>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {estadosConConteo.map((s) => (
                <li key={s}>
                  <Link
                    href={`/solicitudes?estado=${s}`}
                    className="block rounded-lg border border-borde bg-superficie px-4 py-3 shadow-sm hover:border-primario"
                  >
                    <span className="block text-2xl font-semibold tabular-nums">{t.conteos.get(s)}</span>
                    <Insignia tono={tonoEstado(s)}>{etiquetaEstado(s)}</Insignia>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Tarjeta
            titulo="Requerimientos pendientes"
            descripcion="Ordenados por fecha límite (días hábiles restantes)."
            acciones={
              <Link href="/solicitudes/dias-inhabiles" className="text-xs text-primario hover:underline">
                Días inhábiles
              </Link>
            }
          >
            {t.requerimientos.length === 0 ? (
              <ListaVacia>Sin requerimientos pendientes.</ListaVacia>
            ) : (
              <ul className="divide-y divide-borde">
                {t.requerimientos.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <Link href={`/solicitudes/${r.solicitud.id}`} className="font-medium text-primario hover:underline">
                        Solicitud {r.solicitud.numero}
                      </Link>
                      <span className="block text-xs text-texto-suave">
                        Límite {formatoFecha(r.fechaLimite)} · notificado {formatoFecha(r.fechaNotificacion)}
                      </span>
                      <span className="block truncate text-xs text-texto-suave">{r.descripcion}</span>
                    </span>
                    <Insignia tono={r.diasRestantes <= 2 ? "peligro" : "aviso"}>{textoDiasHabiles(r.diasRestantes)}</Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Últimas solicitudes" acciones={<Link href="/solicitudes" className="text-xs text-primario hover:underline">Ver todas</Link>}>
            {t.ultimas.length === 0 ? (
              <ListaVacia>Sin solicitudes.</ListaVacia>
            ) : (
              <ul className="divide-y divide-borde">
                {t.ultimas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <Link href={`/solicitudes/${s.id}`} className="font-medium text-primario hover:underline">
                        Solicitud {s.numero}
                      </Link>
                      <span className="block text-xs text-texto-suave">
                        {s.establecimiento?.denominacionRazonSocial ?? "Sin establecimiento"} · {s._count.partidas} mercancía
                        {s._count.partidas === 1 ? "" : "s"}
                        {s.folioVucem && ` · folio ${s.folioVucem}`}
                      </span>
                    </span>
                    <Insignia tono={tonoEstado(s.estado)}>{etiquetaEstado(s.estado)}</Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Permisos por vencer" descripcion={`Resoluciones con vigencia en los próximos ${DIAS_PERMISO_POR_VENCER} días.`}>
            {t.permisos.length === 0 ? (
              <ListaVacia>Ningún permiso vence pronto.</ListaVacia>
            ) : (
              <ul className="divide-y divide-borde">
                {t.permisos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span>
                      <Link href={`/solicitudes/${p.solicitud.id}`} className="font-medium text-primario hover:underline">
                        Solicitud {p.solicitud.numero}
                      </Link>
                      <span className="block font-mono text-xs text-texto-suave">{p.numeroPermiso ?? "Sin número"}</span>
                    </span>
                    <Insignia tono={p.dias !== null && p.dias <= 7 ? "peligro" : "aviso"}>
                      {textoDias(p.dias)} ({formatoFecha(p.vigenciaHasta)})
                    </Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Registros sanitarios"
            descripcion={`Productos con registro vencido o por vencer en ${DIAS_REGISTRO_POR_VENCER} días o menos.`}
          >
            {t.productos.length === 0 ? (
              <ListaVacia>Todos los registros sanitarios están vigentes.</ListaVacia>
            ) : (
              <ul className="divide-y divide-borde">
                {t.productos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <Link href={`/productos/${p.id}`} className="font-medium text-primario hover:underline">
                        {p.denominacionEspecifica}
                      </Link>
                      <span className="block font-mono text-xs text-texto-suave">{p.numRegistroSanitario}</span>
                    </span>
                    <Insignia tono={p.dias !== null && p.dias < 0 ? "peligro" : "aviso"}>
                      {textoDias(p.dias)} ({formatoFecha(p.vigenciaRegistroSanitario)})
                    </Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Documentos por vencer"
            descripcion={`Documentos con vigencia vencida o que vence en ${DIAS_DOCUMENTO_POR_VENCER} días o menos.`}
            className="lg:col-span-2"
          >
            {t.documentos.length === 0 ? (
              <ListaVacia>Ningún documento vence pronto.</ListaVacia>
            ) : (
              <ul className="divide-y divide-borde">
                {t.documentos.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <Link href={`/documentos/${d.id}`} className="font-medium text-primario hover:underline">
                        {d.nombre}
                      </Link>
                      <span className="block text-xs text-texto-suave">{ETIQUETA_TIPO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}</span>
                    </span>
                    <Insignia tono={d.dias !== null && d.dias < 0 ? "peligro" : "aviso"}>
                      {textoDias(d.dias)} ({formatoFecha(d.vigenciaHasta)})
                    </Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
