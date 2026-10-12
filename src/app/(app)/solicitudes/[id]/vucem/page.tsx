import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, EncabezadoPagina, EnlaceBoton, Insignia, Tabla, Td, Th, Tarjeta, cx } from "@/components/ui";
import { BotonCopiar } from "@/components/ui/copiar";
import { obtenerContexto } from "@/lib/auth/contexto";
import { mapaCatalogo, obtenerOpcionesCatalogo } from "@/lib/catalogos";
import { formatoFecha } from "@/lib/formularios";
import { formatoBytes } from "@/lib/pdf/limites";
import { cargarSolicitudCompleta } from "@/lib/solicitudes/consultas";
import { validarSolicitud } from "@/lib/solicitudes/validacion";
import { obtenerConfiguracionVucem } from "@/lib/vucem/configuracion";
import { tieneCredencial } from "@/lib/vucem/credenciales";
import { bloqueosEnvio, eDocumentsDeOtroAmbiente, envioPrevioSinFolio, motivoNoDigitalizable } from "@/lib/vucem/servicio";
import {
  construirCadenaOriginal260211,
  construirPayload260211,
  seccionesCadena260211,
  xmlVistaPrevia260211,
} from "@/lib/vucem/solicitud-260211";

import { BotonDescartarEDocument } from "./boton-descartar";
import { ETIQUETA_ESTADO_EDOCUMENT, ETIQUETA_TIPO_ENVIO, TONO_ESTADO_EDOCUMENT, formatearXml } from "./formato";
import { FormularioTipoDocumento } from "./formulario-tipo-documento";
import { PanelDigitalizacion } from "./panel-digitalizacion";
import { PanelEnvio } from "./panel-envio";

export const metadata: Metadata = { title: "Envío a VUCEM" };

const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Mexico_City",
});

const ETIQUETA_AMBIENTE = { SIMULADOR: "Simulador", PRUEBAS: "Pruebas", PRODUCCION: "Producción" } as const;
const TONO_AMBIENTE = { SIMULADOR: "info", PRUEBAS: "aviso", PRODUCCION: "peligro" } as const;

function BloqueXml({ titulo, xml }: { titulo: string; xml: string }) {
  return (
    <details className="rounded-md border border-borde px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{titulo}</summary>
      <pre className="mt-2 max-h-96 overflow-auto rounded bg-fondo p-2 font-mono text-xs break-all whitespace-pre-wrap">{formatearXml(xml)}</pre>
    </details>
  );
}

export default async function PaginaEnvioVucem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obtenerContexto();
  const sol = await cargarSolicitudCompleta(ctx.empresa.id, id);
  if (!sol) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const [config, credencial, opcionesTipoDoc, tiposDoc] = await Promise.all([
    obtenerConfiguracionVucem(ctx.empresa.id),
    tieneCredencial(ctx.empresa.id),
    obtenerOpcionesCatalogo("CAT_TIPO_DOCUMENTO"),
    mapaCatalogo("CAT_TIPO_DOCUMENTO"),
  ]);
  const simulador = config.ambiente === "SIMULADOR";
  const faltaCredencial = !credencial && !simulador;

  const validacion = validarSolicitud(sol, { canal: "WS" });
  const erroresPorSeccion = new Map<string, string[]>();
  for (const e of validacion.errores) erroresPorSeccion.set(e.seccion, [...(erroresPorSeccion.get(e.seccion) ?? []), e.mensaje]);

  const payload = construirPayload260211(sol);
  const cadena = construirCadenaOriginal260211(payload, sol.empresa);
  const secciones = seccionesCadena260211(payload, sol.empresa);
  const xmlPrevio = config.operacionSolicitud
    ? xmlVistaPrevia260211(payload, cadena, {
        operacion: config.operacionSolicitud,
        namespace: config.namespaceSolicitud,
        usuario: credencial?.usuarioWs ?? sol.empresa.rfc,
        soapAction: config.soapActionSolicitud,
        url: config.urlSolicitud,
      })
    : null;

  const bloqueos = bloqueosEnvio(sol, config);
  if (faltaCredencial) bloqueos.push("Falta la contraseña de servicios web (Configuración → Conexión VUCEM).");
  const ajenos = await eDocumentsDeOtroAmbiente(ctx.empresa.id, sol.documentos.map((sd) => sd.documento), config.ambiente);
  const ambienteAjeno = new Map(ajenos.map((a) => [a.documentoId, a.ambiente]));
  for (const a of ajenos) bloqueos.push(`El eDocument de «${a.nombre}» se generó en ${a.ambiente}: descártalo y digitalízalo de nuevo.`);
  const previoSinFolio = envioPrevioSinFolio(sol);

  const documentos = sol.documentos.map((sd) => ({ ...sd.documento, motivo: motivoNoDigitalizable(sd.documento) }));
  const porDigitalizar = documentos.filter((d) => !d.eDocument && d.motivo === null).length;
  const pendientes = documentos.filter((d) => d.estadoEDocument === "PENDIENTE" && d.numeroOperacionEDoc && !d.eDocument).length;
  const nombresDocumento = new Map(documentos.map((d) => [d.id, d.nombre]));
  const rutaSolicitud = `/solicitudes/${sol.id}`;

  return (
    <>
      <EncabezadoPagina
        titulo="Enviar a VUCEM por servicio web"
        descripcion="Digitaliza los anexos (eDocument), firma la cadena original con tu e.firma en este navegador y envía la solicitud al WS 260211."
        migas={[
          { etiqueta: "Inicio", href: "/" },
          { etiqueta: "Solicitudes", href: "/solicitudes" },
          { etiqueta: `Solicitud ${sol.numero}`, href: rutaSolicitud },
          { etiqueta: "Envío a VUCEM" },
        ]}
        acciones={
          <>
            <Insignia tono={TONO_AMBIENTE[config.ambiente]}>Ambiente: {ETIQUETA_AMBIENTE[config.ambiente]}</Insignia>
            <EnlaceBoton href={rutaSolicitud} variante="secundario" tamano="sm">
              Volver a la solicitud
            </EnlaceBoton>
          </>
        }
      />

      <div className="space-y-6">
        {simulador && (
          <Aviso tono="info" titulo="Modo SIMULADOR">
            Nada de lo que hagas aquí llega a VUCEM: el simulador interno valida la firma y responde folios y eDocuments ficticios. Cambia el
            ambiente en <Link href="/configuracion/vucem" className="underline">Configuración → Conexión VUCEM</Link>.
          </Aviso>
        )}
        {config.ambiente === "PRODUCCION" && (
          <Aviso tono="aviso" titulo="Ambiente de PRODUCCIÓN">
            Lo que envíes desde aquí queda presentado ante COFEPRIS en VUCEM con efectos legales.
          </Aviso>
        )}
        {faltaCredencial && (
          <Aviso tono="peligro" titulo="Falta la contraseña de servicios web">
            Un administrador debe capturarla en <Link href="/configuracion/vucem" className="underline">Configuración → Conexión VUCEM</Link>.
          </Aviso>
        )}
        {sol.folioVucem && (
          <Aviso tono="exito" titulo={`Presentada con folio ${sol.folioVucem}`}>
            {sol.fechaPresentacion ? `El ${formatoFechaHora.format(sol.fechaPresentacion)}` : "Fecha no registrada"}
            {sol.canalPresentacion ? ` · Canal: ${sol.canalPresentacion === "WS" ? "servicio web" : "portal"}` : ""}.{" "}
            <BotonCopiar valor={sol.folioVucem} etiqueta="Copiar folio" />
          </Aviso>
        )}

        <Tarjeta titulo="Paso 0 · Validación" descripcion="Revisión de la captura contra el Manual WS 260211 para el envío por servicio web.">
          {validacion.errores.length > 0 ? (
            <Aviso tono="peligro" titulo={`La solicitud tiene ${validacion.errores.length} error(es): corrígelos antes de enviar`}>
              <div className="space-y-2">
                {[...erroresPorSeccion.entries()].map(([seccion, mensajes]) => (
                  <div key={seccion}>
                    <p className="text-xs font-semibold uppercase tracking-wide">{seccion}</p>
                    <ul className="list-disc pl-5 text-sm">
                      {mensajes.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <EnlaceBoton href={rutaSolicitud} tamano="sm">
                  Corregir la solicitud
                </EnlaceBoton>
              </div>
            </Aviso>
          ) : (
            <Aviso tono="exito">Sin errores de captura para el envío por servicio web.</Aviso>
          )}
          {validacion.avisos.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-texto-suave">Ver {validacion.avisos.length} aviso(s)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validacion.avisos.map((a, i) => (
                  <li key={i}>
                    <span className="text-texto-suave">{a.seccion}:</span> {a.mensaje}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Paso 1 · Digitalizar anexos (eDocument)"
          descripcion="Cada PDF se registra en el servicio de digitalización de VUCEM con tu firma; VUCEM regresa un eDocument que se cita en la solicitud."
        >
          <div className="space-y-4">
            {documentos.length === 0 ? (
              <p className="text-sm text-texto-suave">
                La solicitud no tiene documentos ligados. Lígalos en la <Link href={rutaSolicitud} className="text-primario underline">solicitud</Link>.
              </p>
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Tipo VUCEM</Th>
                    <Th>PDF</Th>
                    <Th>eDocument</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {documentos.map((d) => (
                    <tr key={d.id}>
                      <Td>
                        <Link href={`/documentos/${d.id}`} className="font-medium text-primario hover:underline">
                          {d.nombre}
                        </Link>
                      </Td>
                      <Td>
                        {d.idTipoDocumentoVucem ? (
                          <span className="text-sm">
                            {tiposDoc.get(d.idTipoDocumentoVucem) ?? "Clave"} ({d.idTipoDocumentoVucem})
                          </span>
                        ) : puedeEditar && !sol.folioVucem ? (
                          <FormularioTipoDocumento solicitudId={sol.id} documentoId={d.id} nombreDocumento={d.nombre} opciones={opcionesTipoDoc} />
                        ) : (
                          <Insignia tono="aviso">Sin tipo</Insignia>
                        )}
                      </Td>
                      <Td className="text-xs text-texto-suave">
                        {d.archivoVucemRuta ? `${formatoBytes(d.archivoVucemBytes)}${d.paginas ? ` · ${d.paginas} pág.` : ""}` : "Sin convertir"}
                      </Td>
                      <Td>
                        <div className="space-y-1">
                          <Insignia tono={TONO_ESTADO_EDOCUMENT[d.estadoEDocument] ?? "neutro"}>
                            {ETIQUETA_ESTADO_EDOCUMENT[d.estadoEDocument] ?? d.estadoEDocument}
                          </Insignia>
                          {d.eDocument && (
                            <p className="flex flex-wrap items-center gap-2">
                              <code className="font-mono text-xs">{d.eDocument}</code>
                              <BotonCopiar valor={d.eDocument} />
                            </p>
                          )}
                          {ambienteAjeno.has(d.id) && (
                            <div className="space-y-1">
                              <Insignia tono="aviso">Generado en {ambienteAjeno.get(d.id)}</Insignia>
                              {puedeEditar && !sol.folioVucem && (
                                <BotonDescartarEDocument solicitudId={sol.id} documentoId={d.id} ambiente={ambienteAjeno.get(d.id) ?? ""} />
                              )}
                            </div>
                          )}
                          {d.estadoEDocument === "PENDIENTE" && d.numeroOperacionEDoc && (
                            <p className="text-xs text-texto-suave">Operación {d.numeroOperacionEDoc}</p>
                          )}
                          {d.estadoEDocument === "ERROR" && d.errorEDocument && <p className="text-xs text-peligro">{d.errorEDocument}</p>}
                          {!d.eDocument && d.motivo && d.estadoEDocument !== "PENDIENTE" && (
                            <p className="text-xs text-texto-suave">{d.motivo}</p>
                          )}
                          {d.eDocumentFecha && <p className="text-xs text-texto-suave">{formatoFecha(d.eDocumentFecha)}</p>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}

            {config.faltantesDigitalizacion.length > 0 && (
              <Aviso tono="aviso">
                Falta configurar {config.faltantesDigitalizacion.join(" y ")} en{" "}
                <Link href="/configuracion/vucem" className="underline">Configuración → Conexión VUCEM</Link>.
              </Aviso>
            )}

            {!puedeEditar ? (
              <p className="text-sm text-texto-suave">Tu rol es de solo consulta: no puedes digitalizar ni enviar.</p>
            ) : sol.folioVucem ? null : faltaCredencial || config.faltantesDigitalizacion.length > 0 ? null : (
              <PanelDigitalizacion
                solicitudId={sol.id}
                rfcEsperado={sol.empresa.rfc}
                porDigitalizar={porDigitalizar}
                pendientes={pendientes}
              />
            )}
          </div>
        </Tarjeta>

        <Tarjeta
          titulo="Paso 2 · Firmar y enviar la solicitud"
          descripcion="La cadena original se calcula en el servidor con los datos de la solicitud; se firma en tu navegador y el servidor verifica que sea idéntica antes de enviarla."
        >
          <div className="space-y-4">
            {sol.folioVucem ? (
              <Aviso tono="exito">Esta solicitud ya se presentó (folio {sol.folioVucem}); no se puede volver a enviar.</Aviso>
            ) : bloqueos.length > 0 ? (
              <Aviso tono="aviso" titulo="Todavía no se puede enviar">
                <ul className="list-disc space-y-1 pl-5">
                  {bloqueos.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Aviso>
            ) : null}

            <details className="rounded-md border border-borde px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Ver la cadena original ({cadena.length} caracteres)</summary>
              <div className="mt-2 space-y-3">
                <div className="flex items-start gap-2">
                  <pre className="max-h-60 flex-1 overflow-auto rounded bg-fondo p-2 font-mono text-xs break-all whitespace-pre-wrap">{cadena}</pre>
                  <BotonCopiar valor={cadena} />
                </div>
                <details>
                  <summary className="cursor-pointer text-texto-suave">Desglose por sección (orden de la sección 4 del manual)</summary>
                  <div className="mt-2 space-y-3">
                    {secciones.map((s) => (
                      <div key={s.seccion}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{s.seccion}</p>
                        {s.campos.length === 0 ? (
                          <p className="text-xs text-texto-suave">Sin datos.</p>
                        ) : (
                          <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-3 text-xs">
                            {s.campos.map((c, i) => (
                              <div key={i} className="contents">
                                <dt className="text-texto-suave">{c.nombre}</dt>
                                <dd className={cx("break-all", !c.valor && "text-texto-suave")}>{c.valor || "(vacío)"}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </details>

            {xmlPrevio && <BloqueXml titulo="Ver el XML que se enviará (contraseña oculta)" xml={xmlPrevio} />}

            {puedeEditar && !sol.folioVucem && bloqueos.length === 0 && (
              <PanelEnvio
                solicitudId={sol.id}
                cadena={cadena}
                rfcEsperado={sol.empresa.rfc}
                ambiente={config.ambiente}
                requiereConfirmacionReenvio={Boolean(previoSinFolio)}
              />
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Historial de envíos a VUCEM" descripcion="Intercambios con los servicios web de esta solicitud (los XML se guardan sin contraseña).">
          {sol.envios.length === 0 ? (
            <p className="text-sm text-texto-suave">Todavía no hay envíos.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {sol.envios.map((e) => (
                <li key={e.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-texto-suave">{formatoFechaHora.format(e.creadoEn)}</span>
                      <span className="font-medium">{ETIQUETA_TIPO_ENVIO[e.tipo] ?? e.tipo}</span>
                      {e.documentoId && <span className="text-texto-suave">{nombresDocumento.get(e.documentoId) ?? "Documento"}</span>}
                      <Insignia tono={e.exito ? "exito" : "peligro"}>{e.exito ? "Éxito" : "Error"}</Insignia>
                      {e.ambiente !== "PRODUCCION" && <Insignia>{ETIQUETA_AMBIENTE[e.ambiente as keyof typeof ETIQUETA_AMBIENTE] ?? e.ambiente}</Insignia>}
                      {e.resultado && <code className="font-mono text-xs">{e.resultado}</code>}
                    </summary>
                    <div className="mt-2 space-y-2 text-sm">
                      {e.mensaje && <p>{e.mensaje}</p>}
                      <p className="text-xs break-all text-texto-suave">
                        {e.url}
                        {e.httpStatus !== null ? ` · HTTP ${e.httpStatus}` : " · sin respuesta"}
                      </p>
                      {e.cadenaOriginal && (
                        <pre className="max-h-40 overflow-auto rounded bg-fondo p-2 font-mono text-xs break-all whitespace-pre-wrap">{e.cadenaOriginal}</pre>
                      )}
                      <BloqueXml titulo="Petición (XML)" xml={e.requestXml} />
                      {e.responseXml && <BloqueXml titulo="Respuesta (XML)" xml={e.responseXml} />}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
