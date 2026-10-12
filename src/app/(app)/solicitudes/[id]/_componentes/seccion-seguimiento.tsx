import Link from "next/link";

import { Datos, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { BotonCopiar } from "@/components/ui/copiar";
import type { SentidoResolucion } from "@/lib/constantes";
import { fechaAInput, formatoFecha } from "@/lib/formularios";
import type { SolicitudCompleta } from "@/lib/solicitudes/consultas";
import { diasHabilesEntre } from "@/lib/solicitudes/dias-habiles";
import { claveDiaMexico } from "@/lib/solicitudes/fechas";
import { ETIQUETA_SENTIDO, TONO_SENTIDO, textoDiasHabiles } from "@/lib/solicitudes/presentacion";

import { atenderRequerimiento, eliminarRequerimiento, registrarRequerimiento, registrarResolucion } from "../../acciones-seguimiento";
import { BotonAccion } from "../../_componentes/boton-accion";
import { FormAtender, FormRequerimiento, FormResolucion } from "../../_componentes/formularios-seguimiento";

/** Presentación, requerimientos y resolución de una solicitud ya presentada. */
export function SeccionSeguimiento({
  sol,
  inhabiles,
  puedeEditar,
}: {
  sol: SolicitudCompleta;
  inhabiles: Date[];
  puedeEditar: boolean;
}) {
  const hoy = new Date();
  const hoyClave = claveDiaMexico(hoy);
  const enTramite = sol.estado === "PRESENTADA" || sol.estado === "REQUERIMIENTO";
  const resuelta = sol.estado.startsWith("RESUELTA_");
  const res = sol.resolucion;
  const pendientes = sol.requerimientos.filter((r) => r.estado === "PENDIENTE");

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Presentación"
        acciones={
          puedeEditar &&
          enTramite && (
            <EnlaceBoton href={`/solicitudes/${sol.id}/presentar`} variante="secundario" tamano="sm">
              {sol.folioVucem ? "Corregir datos" : "Registrar presentación"}
            </EnlaceBoton>
          )
        }
      >
        <Datos
          filas={[
            [
              "Folio VUCEM",
              sol.folioVucem ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-mono">{sol.folioVucem}</span>
                  <BotonCopiar valor={sol.folioVucem} />
                </span>
              ) : null,
            ],
            ["Fecha de presentación", formatoFecha(sol.fechaPresentacion)],
            ["Canal", sol.canalPresentacion === "WS" ? "Servicio web" : sol.canalPresentacion === "PORTAL" ? "Portal VUCEM" : null],
            ["Número temporal", sol.numeroTemporal],
            [
              "Acuse",
              sol.acuseRuta ? (
                <a href={`/solicitudes/${sol.id}/archivos?tipo=acuse`} className="text-primario hover:underline">
                  Descargar acuse (PDF)
                </a>
              ) : (
                "Sin acuse guardado"
              ),
            ],
          ]}
        />
      </Tarjeta>

      <Tarjeta
        titulo="Requerimientos"
        descripcion={
          <>
            Fecha límite en días hábiles (sin sábados, domingos ni{" "}
            <Link href="/solicitudes/dias-inhabiles" className="text-primario hover:underline">
              días inhábiles registrados
            </Link>
            ). El día de la notificación no cuenta. Los periodos vacacionales de COFEPRIS se publican cada año en el DOF y deben
            agregarse a los días inhábiles.
          </>
        }
      >
        <div className="space-y-4">
          {sol.requerimientos.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin requerimientos.</p>
          ) : (
            <ul className="space-y-3">
              {sol.requerimientos.map((r, i) => {
                const dias = r.estado === "PENDIENTE" ? diasHabilesEntre(hoy, r.fechaLimite, inhabiles) : null;
                return (
                  <li key={r.id} className="space-y-2 rounded-md border border-borde p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        Notificado el {formatoFecha(r.fechaNotificacion)} · plazo {r.plazoDiasHabiles} días hábiles · límite{" "}
                        {formatoFecha(r.fechaLimite)}
                      </p>
                      {r.estado === "PENDIENTE" && dias !== null ? (
                        <Insignia tono={dias <= 2 ? "peligro" : "aviso"}>{dias < 0 ? textoDiasHabiles(dias) : `Pendiente · ${textoDiasHabiles(dias)}`}</Insignia>
                      ) : (
                        <Insignia tono="exito">Atendido el {formatoFecha(r.fechaAtencion)}</Insignia>
                      )}
                    </div>
                    <p className="whitespace-pre-line text-texto-suave">{r.descripcion}</p>
                    {r.notas && <p className="text-xs text-texto-suave">Notas: {r.notas}</p>}
                    {puedeEditar && enTramite && r.estado === "PENDIENTE" && (
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <FormAtender accion={atenderRequerimiento.bind(null, sol.id, r.id)} prefijo={`rq${i}`} hoy={hoyClave} />
                        <BotonAccion
                          accion={eliminarRequerimiento.bind(null, sol.id, r.id)}
                          variante="fantasma"
                          textoEnviando="Eliminando…"
                          confirmar="¿Eliminar este requerimiento? Úsalo solo si se capturó por error."
                        >
                          Eliminar
                        </BotonAccion>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {puedeEditar && enTramite && (
            <details className="rounded-md border border-dashed border-borde px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primario">Registrar requerimiento</summary>
              <div className="mt-3">
                <FormRequerimiento
                  accion={registrarRequerimiento.bind(null, sol.id)}
                  inhabiles={inhabiles.map((d) => claveDiaMexico(d))}
                  hoy={hoyClave}
                />
              </div>
            </details>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Resolución">
        <div className="space-y-4">
          {res ? (
            <>
              <Datos
                filas={[
                  ["Sentido", <Insignia key="s" tono={TONO_SENTIDO[res.sentido as SentidoResolucion] ?? "neutro"}>{ETIQUETA_SENTIDO[res.sentido as SentidoResolucion] ?? res.sentido}</Insignia>],
                  [
                    "Número de permiso u oficio",
                    res.numeroPermiso ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-mono">{res.numeroPermiso}</span>
                        <BotonCopiar valor={res.numeroPermiso} />
                      </span>
                    ) : null,
                  ],
                  ["Fecha de resolución", formatoFecha(res.fechaResolucion)],
                  ["Vigencia del permiso", res.vigenciaHasta ? formatoFecha(res.vigenciaHasta) : "No capturada"],
                  ["Restricciones", res.restricciones ? <span className="whitespace-pre-line">{res.restricciones}</span> : null],
                  ["Observaciones", res.observaciones ? <span className="whitespace-pre-line">{res.observaciones}</span> : null],
                  [
                    "Documento",
                    res.documentoRuta ? (
                      <a href={`/solicitudes/${sol.id}/archivos?tipo=resolucion`} className="text-primario hover:underline">
                        Descargar resolución (PDF)
                      </a>
                    ) : (
                      "Sin PDF guardado"
                    ),
                  ],
                ]}
              />
              {res.sentido === "PARCIAL" && (
                <ul className="space-y-1 text-sm">
                  {sol.partidas.map((p, i) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      {i + 1}. {p.denominacionEspecifica}
                      {p.resultado && <Insignia tono={p.resultado === "ACEPTADA" ? "exito" : "peligro"}>{p.resultado === "ACEPTADA" ? "Aceptada" : "Rechazada"}</Insignia>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-texto-suave">{enTramite ? "Aún sin resolución." : "La solicitud no se ha presentado."}</p>
          )}
          {puedeEditar && (enTramite || resuelta) && (
            <details className="rounded-md border border-dashed border-borde px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primario">{res ? "Corregir resolución" : "Registrar resolución"}</summary>
              <div className="mt-3">
                {pendientes.length > 0 && (
                  <p className="mb-3 text-sm text-aviso">Hay requerimientos pendientes; al registrar la resolución dejarán de mostrarse como alertas.</p>
                )}
                <FormResolucion
                  accion={registrarResolucion.bind(null, sol.id)}
                  inicial={{
                    sentido: res?.sentido ?? "",
                    numeroPermiso: res?.numeroPermiso ?? "",
                    fechaResolucion: res ? fechaAInput(res.fechaResolucion) : hoyClave,
                    vigenciaHasta: fechaAInput(res?.vigenciaHasta),
                    restricciones: res?.restricciones ?? "",
                    observaciones: res?.observaciones ?? "",
                  }}
                  partidas={sol.partidas.map((p) => ({ id: p.id, nombre: p.denominacionEspecifica, resultado: p.resultado }))}
                  hayDocumento={!!res?.documentoRuta}
                />
              </div>
            </details>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
