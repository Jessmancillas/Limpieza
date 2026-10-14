import { FormaAccion } from "@/components/erp/forma-accion";
import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { AreaTexto, Campo, EncabezadoPagina, Entrada, EstadoVacio, Insignia, Selector, Tarjeta } from "@/components/ui";
import { db } from "@/lib/db";
import {
  ETIQUETA_ESTADO_TICKET,
  ETIQUETA_TIPO_TICKET,
  SERVICIOS_NEGOCIO,
  TIPOS_CAMBIO,
  TIPOS_TICKET,
  type EstadoTicket,
  type TipoTicket,
} from "@/lib/erp/constantes";
import { semaforo } from "@/lib/erp/decisiones/gobierno";
import { INFO_PRIORIDAD, slaIncumplido, transicionesPermitidas } from "@/lib/erp/decisiones/itil";
import { formatoPct } from "@/lib/erp/dinero";
import { TONO_PRIORIDAD, TONO_TICKET } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasGobierno } from "../../_erp/comunes";
import { cambiarEstadoTicket, crearTicket } from "../acciones";

const ETIQUETA_NIVEL = { 1: "Alto", 2: "Medio", 3: "Bajo" } as const;

function fechaHora(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(d);
}

export default async function MesaServicio() {
  const ctx = await obtenerContextoErp();
  const tickets = await db.ticketServicio.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: [{ prioridad: "asc" }, { numero: "desc" }], take: 200 });
  const ahora = new Date();
  const abiertos = tickets.filter((t) => !["RESUELTO", "CERRADO", "RECHAZADO"].includes(t.estado));
  const resueltos = tickets.filter((t) => t.resueltoEn && t.tipo !== "CAMBIO");
  const cumplimientoSla = resueltos.length > 0 ? resueltos.filter((t) => !slaIncumplido(t, ahora)).length / resueltos.length : null;
  const puedeCrear = ctx.rol !== "CONSULTA";

  return (
    <>
      <EncabezadoPagina
        titulo="Mesa de servicio (ITIL 4)"
        descripcion="Incidentes, problemas, solicitudes y cambios de los servicios de negocio. Prioridad = matriz impacto × urgencia; SLA por prioridad; cambios normales y de emergencia pasan por el CAB."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Gobierno", href: "/gobierno" }, { etiqueta: "Mesa de servicio" }]}
      />
      <PestanasGobierno actual="/gobierno/servicios" />
      <div className="space-y-6">
        <RejillaKpi>
          <Kpi titulo="Abiertos" valor={abiertos.length} detalle={`P1/P2: ${abiertos.filter((t) => t.prioridad <= 2).length}`} />
          <Kpi titulo="SLA vencido" valor={abiertos.filter((t) => slaIncumplido(t, ahora)).length} semaforo={abiertos.some((t) => slaIncumplido(t, ahora)) ? "rojo" : "verde"} />
          <Kpi titulo="Cumplimiento de SLA" valor={formatoPct(cumplimientoSla)} semaforo={semaforo(cumplimientoSla, 0.9, "mayor")} marco="COBIT DSS02 · meta 90 %" />
          <Kpi titulo="Cambios pendientes de CAB" valor={tickets.filter((t) => t.estado === "PENDIENTE_APROBACION").length} marco="COBIT BAI06 / ISO A.8.32" />
        </RejillaKpi>

        <Tarjeta titulo="Matriz de prioridad y SLA">
          <div className="flex flex-wrap gap-2 text-xs">
            {([1, 2, 3, 4, 5] as const).map((p) => (
              <Insignia key={p} tono={TONO_PRIORIDAD[p]}>
                {`${INFO_PRIORIDAD[p].etiqueta} · ${INFO_PRIORIDAD[p].slaHoras} h`}
              </Insignia>
            ))}
          </div>
          <p className="mt-2 text-xs text-texto-suave">Prioridad = impacto + urgencia − 1 (1 = alto, 3 = bajo). Ej.: impacto alto y urgencia alta → P1.</p>
        </Tarjeta>

        {puedeCrear && (
          <Tarjeta titulo="Nuevo ticket">
            <FormaAccion accion={crearTicket} textoBoton="Registrar ticket" reiniciar>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo etiqueta="Tipo" htmlFor="tipo">
                  <Selector id="tipo" name="tipo">
                    {TIPOS_TICKET.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO_TICKET[t]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Servicio afectado" htmlFor="servicio">
                  <Selector id="servicio" name="servicio">
                    {SERVICIOS_NEGOCIO.map((s) => (
                      <option key={s} value={s}>
                        {s.toLowerCase()}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Tipo de cambio (solo cambios)" htmlFor="tipoCambio">
                  <Selector id="tipoCambio" name="tipoCambio" defaultValue="">
                    <option value="">—</option>
                    {TIPOS_CAMBIO.map((t) => (
                      <option key={t} value={t}>
                        {t.toLowerCase()}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Impacto" htmlFor="impacto">
                  <Selector id="impacto" name="impacto" defaultValue="2">
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {ETIQUETA_NIVEL[n as 1 | 2 | 3]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Urgencia" htmlFor="urgencia">
                  <Selector id="urgencia" name="urgencia" defaultValue="2">
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {ETIQUETA_NIVEL[n as 1 | 2 | 3]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Título" htmlFor="titulo" requerido>
                  <Entrada id="titulo" name="titulo" required maxLength={150} />
                </Campo>
                <Campo etiqueta="Descripción" htmlFor="descripcion" requerido className="sm:col-span-3">
                  <AreaTexto id="descripcion" name="descripcion" required />
                </Campo>
              </div>
            </FormaAccion>
          </Tarjeta>
        )}

        {tickets.length === 0 ? (
          <EstadoVacio titulo="Sin tickets" />
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => {
              const vencido = slaIncumplido(t, ahora);
              const siguientes = transicionesPermitidas(t.tipo as TipoTicket, t.estado as EstadoTicket);
              return (
                <details key={t.id} className="rounded-lg border border-borde bg-superficie">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <Insignia tono={TONO_PRIORIDAD[t.prioridad]}>{`P${t.prioridad}`}</Insignia>
                    <span className="font-mono text-xs">#{t.numero}</span>
                    <span className="font-medium">{t.titulo}</span>
                    <span className="text-texto-suave">
                      · {ETIQUETA_TIPO_TICKET[t.tipo as TipoTicket]}
                      {t.tipoCambio ? ` ${t.tipoCambio.toLowerCase()}` : ""} · {t.servicio.toLowerCase()}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {vencido && <Insignia tono="peligro">SLA vencido</Insignia>}
                      <Insignia tono={TONO_TICKET[t.estado]}>{ETIQUETA_ESTADO_TICKET[t.estado as EstadoTicket] ?? t.estado}</Insignia>
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-borde px-4 py-3 text-sm">
                    <p className="whitespace-pre-line">{t.descripcion}</p>
                    <p className="text-xs text-texto-suave">
                      Creado {formatoFecha(t.creadoEn)} · SLA vence {fechaHora(t.venceEn)}
                      {t.resueltoEn ? ` · resuelto ${fechaHora(t.resueltoEn)}` : ""}
                    </p>
                    {t.solucion && <p>Solución: {t.solucion}</p>}
                    {puedeCrear && siguientes.length > 0 && (
                      <FormaAccion accion={cambiarEstadoTicket.bind(null, t.id)} textoBoton="Actualizar" tamano="sm" className="flex flex-wrap items-end gap-2 space-y-0">
                        <Selector name="estado" aria-label="Nuevo estado" className="w-56">
                          {siguientes.map((e) => (
                            <option key={e} value={e}>
                              {ETIQUETA_ESTADO_TICKET[e]}
                            </option>
                          ))}
                        </Selector>
                        <Entrada name="solucion" placeholder="Solución (obligatoria al resolver)" aria-label="Solución" className="w-80" />
                      </FormaAccion>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
