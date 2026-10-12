import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, clasesBoton, Datos, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { BotonCopiar } from "@/components/ui/copiar";
import { obtenerContexto } from "@/lib/auth/contexto";
import { describirClave } from "@/lib/catalogos";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type EstadoSolicitud,
  type TipoDocumento,
} from "@/lib/constantes";
import { db } from "@/lib/db";
import { fechaAInput, formatoFecha } from "@/lib/formularios";
import { BYTES_POR_MB_VUCEM, formatoBytes, MB_RECOMENDADO_VUCEM } from "@/lib/pdf/limites";
import { ESTADOS_NO_EDITABLES } from "@/lib/solicitudes/consultas";

import { cargarOpcionesDocumento, limitesPdfVigentes } from "../_lib/servidor";
import { estadoVigencia, leerReporte, parametro, rutaInternaSegura } from "../_lib/utilidades";
import { actualizarDocumento, eliminarDocumento, reconvertirDocumento, reemplazarArchivo } from "../acciones";
import { AccionesDocumento } from "../acciones-documento";
import { FormularioDocumento } from "../formulario";
import { InsigniaConversion, InsigniaEDocument, InsigniaVigencia } from "../insignias";

const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const ETIQUETA_ENVIO: Record<string, string> = {
  DIGITALIZACION_REGISTRO: "Envío",
  DIGITALIZACION_CONSULTA: "Consulta",
};

export default async function DetalleDocumento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const doc = await db.documento.findFirst({
    where: { id, empresaId },
    include: {
      producto: { select: { id: true, denominacionEspecifica: true } },
      establecimiento: { select: { id: true, denominacionRazonSocial: true } },
      solicitudes: {
        where: { solicitud: { empresaId } },
        select: { id: true, requisito: true, solicitud: { select: { id: true, numero: true, estado: true } } },
        orderBy: { solicitud: { numero: "desc" } },
      },
      envios: {
        where: { empresaId },
        select: { id: true, tipo: true, creadoEn: true, exito: true, mensaje: true },
        orderBy: { creadoEn: "desc" },
        take: 5,
      },
      _count: { select: { solicitudes: true } },
    },
  });
  if (!doc) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const [opciones, limites, tipoVucem] = await Promise.all([
    puedeEditar ? cargarOpcionesDocumento(empresaId, { productoId: doc.productoId, establecimientoId: doc.establecimientoId }) : null,
    limitesPdfVigentes(),
    describirClave("CAT_TIPO_DOCUMENTO", doc.idTipoDocumentoVucem),
  ]);
  const reporte = leerReporte(doc.reporteConversion);
  const volver = rutaInternaSegura(parametro(sp.volver));
  const vigencia = estadoVigencia(doc.vigenciaHasta);
  const etiquetaTipo = ETIQUETA_TIPO_DOCUMENTO[doc.tipo as TipoDocumento] ?? doc.tipo;
  const presentadas = doc.solicitudes.filter((s) => ESTADOS_NO_EDITABLES.has(s.solicitud.estado)).map((s) => s.solicitud.numero);
  const bloqueado =
    presentadas.length > 0
      ? `El archivo no se puede cambiar porque ya se presentó en ${presentadas.length === 1 ? "la solicitud" : "las solicitudes"} ${presentadas.join(", ")}.`
      : null;
  const excedeLimiteActual = doc.archivoVucemBytes !== null && doc.archivoVucemBytes > limites.maxMB * BYTES_POR_MB_VUCEM;
  const urlArchivo = (version: "original" | "vucem") => `/api/documentos/${doc.id}/archivo?version=${version}`;

  return (
    <>
      <EncabezadoPagina
        titulo={doc.nombre}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{etiquetaTipo}</span>
            <InsigniaConversion estado={doc.estadoConversion} />
            <InsigniaEDocument estado={doc.estadoEDocument} />
            {doc.vigenciaHasta && <InsigniaVigencia vigenciaHasta={doc.vigenciaHasta} />}
          </span>
        }
        migas={[{ etiqueta: "Documentos", href: "/documentos" }, { etiqueta: doc.nombre }]}
        acciones={
          <>
            {volver && (
              <EnlaceBoton href={volver} variante="secundario">
                ← Regresar
              </EnlaceBoton>
            )}
            {doc.archivoVucemRuta && (
              <a href={urlArchivo("vucem")} className={clasesBoton("primario")}>
                Descargar PDF para VUCEM
              </a>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {sp.creado && doc.estadoConversion !== "ERROR" && (
          <Aviso tono="exito">Documento guardado y convertido al formato de VUCEM. Revisa el resultado antes de digitalizarlo.</Aviso>
        )}
        {doc.estadoConversion === "ERROR" && (
          <Aviso tono="peligro" titulo={sp.creado ? "Documento guardado, pero no se pudo convertir" : "No se pudo convertir el documento"}>
            <p>{reporte?.error ?? "Error desconocido al convertir."}</p>
            {puedeEditar && (
              <p className="mt-1 text-xs">
                Corrige el archivo (por ejemplo, quita la contraseña o divídelo) y usa «Reemplazar archivo», o intenta «Re-convertir».
              </p>
            )}
          </Aviso>
        )}
        {doc.estadoConversion === "PENDIENTE" && (
          <Aviso tono="info">El documento aún no se ha convertido. Usa «Re-convertir» para generar la versión de VUCEM.</Aviso>
        )}
        {vigencia.estado === "VENCIDO" && (
          <Aviso tono="peligro" titulo="Documento vencido">
            Venció el {formatoFecha(doc.vigenciaHasta)}. Sube la versión vigente antes de usarlo en una solicitud.
          </Aviso>
        )}
        {excedeLimiteActual && (
          <Aviso tono="aviso">
            El PDF convertido pesa {formatoBytes(doc.archivoVucemBytes)} y el límite vigente del trámite es {limites.maxMB} MB.
            Usa «Re-convertir» para ajustarlo.
          </Aviso>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Tarjeta
            titulo="Versión para VUCEM"
            descripcion="PDF solo-imagen en escala de grises, sin formularios ni páginas en blanco."
            acciones={
              doc.archivoVucemRuta && (
                <a href={urlArchivo("vucem")} className={clasesBoton("secundario", "sm")}>
                  Descargar
                </a>
              )
            }
          >
            {doc.archivoVucemRuta ? (
              <Datos
                filas={[
                  ["Estado", <InsigniaConversion key="estado" estado={doc.estadoConversion} />],
                  ["Páginas", doc.paginas],
                  ["Resolución", doc.dpi ? `${doc.dpi} dpi` : null],
                  [
                    "Tamaño",
                    <>
                      {formatoBytes(doc.archivoVucemBytes)}
                      {doc.archivoVucemBytes !== null && doc.archivoVucemBytes > MB_RECOMENDADO_VUCEM * BYTES_POR_MB_VUCEM && (
                        <span className="ml-2">
                          <Insignia tono="aviso">Más de {MB_RECOMENDADO_VUCEM} MB</Insignia>
                        </span>
                      )}
                    </>,
                  ],
                  [
                    "SHA-1",
                    doc.sha1Vucem ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-xs break-all">{doc.sha1Vucem}</code>
                        <BotonCopiar valor={doc.sha1Vucem} etiqueta="Copiar" />
                      </span>
                    ) : null,
                  ],
                  ["Calidad de imagen (JPEG)", reporte?.calidadJpeg ?? null],
                  ["Convertido", reporte?.fecha ? formatoFechaHora.format(new Date(reporte.fecha)) : null],
                  [
                    "Límites aplicados",
                    reporte?.limites?.minDpi && reporte.limites.maxMB
                      ? `≥ ${reporte.limites.minDpi} dpi · máx. ${reporte.limites.maxMB} MB`
                      : null,
                  ],
                ]}
              />
            ) : (
              <p className="text-sm text-texto-suave">Aún no hay versión para VUCEM.</p>
            )}

            {reporte && (reporte.avisos.length > 0 || reporte.notas.length > 0) && (
              <div className="mt-4 space-y-3">
                {reporte.avisos.length > 0 && (
                  <Aviso tono="aviso" titulo="Revisa">
                    <ul className="list-disc space-y-1 pl-4">
                      {reporte.avisos.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </Aviso>
                )}
                {reporte.notas.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-texto-suave">
                    {reporte.notas.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {reporte && reporte.paginasEnBlancoEliminadas.length > 0 && (
              <p className="mt-3 text-xs text-texto-suave">
                Páginas del original eliminadas por estar en blanco: {reporte.paginasEnBlancoEliminadas.join(", ")}.
              </p>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Archivo original"
            acciones={
              <a href={urlArchivo("original")} className={clasesBoton("secundario", "sm")}>
                Descargar original
              </a>
            }
          >
            <Datos
              filas={[
                ["Archivo", <span key="archivo" className="break-all">{doc.archivoOriginalNombre}</span>],
                ["Formato", doc.archivoOriginalMime],
                ["Tamaño", formatoBytes(doc.archivoOriginalBytes)],
                ["Subido", formatoFechaHora.format(doc.creadoEn)],
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo={puedeEditar ? "Editar datos" : "Datos"}>
            {puedeEditar && opciones ? (
              <FormularioDocumento
                modo="editar"
                accion={actualizarDocumento.bind(null, doc.id)}
                inicial={{
                  tipo: (TIPOS_DOCUMENTO as readonly string[]).includes(doc.tipo) ? (doc.tipo as TipoDocumento) : "",
                  nombre: doc.nombre,
                  idTipoDocumentoVucem: doc.idTipoDocumentoVucem,
                  productoId: doc.productoId,
                  establecimientoId: doc.establecimientoId,
                  vigenciaHasta: fechaAInput(doc.vigenciaHasta),
                }}
                opciones={opciones}
                limites={limites}
                textoBoton="Guardar cambios"
              />
            ) : (
              <Datos
                filas={[
                  ["Tipo", etiquetaTipo],
                  ["Nombre (nombreDocumento en VUCEM)", doc.nombre],
                  ["Vigencia", formatoFecha(doc.vigenciaHasta)],
                  [
                    "Producto",
                    doc.producto ? (
                      <Link href={`/productos/${doc.producto.id}`} className="text-primario hover:underline">
                        {doc.producto.denominacionEspecifica}
                      </Link>
                    ) : null,
                  ],
                  [
                    "Establecimiento",
                    doc.establecimiento ? (
                      <Link href={`/establecimientos/${doc.establecimiento.id}`} className="text-primario hover:underline">
                        {doc.establecimiento.denominacionRazonSocial}
                      </Link>
                    ) : null,
                  ],
                  ["Tipo de documento VUCEM", tipoVucem],
                ]}
              />
            )}
            {puedeEditar && doc.eDocument && (
              <p className="mt-3 text-xs text-texto-suave">
                El eDocument ya se generó con el nombre y tipo anteriores; cambiar estos datos no lo modifica en VUCEM.
              </p>
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-6">
          <Tarjeta titulo="Digitalización VUCEM" descripcion="eDocument que se cita en la solicitud.">
            <Datos
              filas={[
                ["Estado", <InsigniaEDocument key="edoc" estado={doc.estadoEDocument} />],
                [
                  "eDocument",
                  doc.eDocument ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs break-all">{doc.eDocument}</code>
                      <BotonCopiar valor={doc.eDocument} />
                    </span>
                  ) : null,
                ],
                ["Número de operación", doc.numeroOperacionEDoc ? <code className="font-mono text-xs">{doc.numeroOperacionEDoc}</code> : null],
                ["Número de trámite", doc.numeroTramiteEDoc],
                ["Fecha", doc.eDocumentFecha ? formatoFechaHora.format(doc.eDocumentFecha) : null],
                ["Tipo de documento VUCEM", tipoVucem],
              ]}
            />
            {doc.errorEDocument && (
              <div className="mt-3">
                <Aviso tono="peligro" titulo="Error de digitalización">
                  {doc.errorEDocument}
                </Aviso>
              </div>
            )}
            {doc.estadoEDocument === "NO_ENVIADO" && doc.archivoVucemRuta && (
              <p className="mt-3 text-xs text-texto-suave">
                Se digitaliza con el servicio web de VUCEM al preparar la solicitud, o puedes hacerlo en el portal con el PDF para
                VUCEM.
              </p>
            )}
            {doc.envios.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-suave">Últimos envíos</h3>
                <ul className="mt-2 space-y-2 text-xs">
                  {doc.envios.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <Insignia tono={e.exito ? "exito" : "peligro"}>{e.exito ? "Éxito" : "Falló"}</Insignia>
                      <span>
                        {ETIQUETA_ENVIO[e.tipo] ?? e.tipo} · {formatoFechaHora.format(e.creadoEn)}
                      </span>
                      {e.mensaje && <span className="block w-full text-texto-suave">{e.mensaje}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Solicitudes donde se usa">
            {doc.solicitudes.length === 0 ? (
              <p className="text-sm text-texto-suave">Aún no se usa en solicitudes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {doc.solicitudes.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/solicitudes/${s.solicitud.id}`} className="font-medium text-primario hover:underline">
                      Solicitud {s.solicitud.numero}
                    </Link>
                    <Insignia>{ETIQUETA_ESTADO_SOLICITUD[s.solicitud.estado as EstadoSolicitud] ?? s.solicitud.estado}</Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {puedeEditar && (
            <Tarjeta titulo="Acciones">
              <AccionesDocumento
                nombre={doc.nombre}
                tieneEDocument={doc.estadoEDocument !== "NO_ENVIADO"}
                bloqueadoPorSolicitudes={bloqueado}
                enSolicitudes={doc._count.solicitudes}
                accionReconvertir={reconvertirDocumento.bind(null, doc.id)}
                accionReemplazar={reemplazarArchivo.bind(null, doc.id)}
                accionEliminar={eliminarDocumento.bind(null, doc.id)}
              />
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
