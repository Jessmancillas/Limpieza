import { FormaAccion } from "@/components/erp/forma-accion";
import { AreaTexto, Campo, Casilla, EncabezadoPagina, Entrada, EstadoVacio, Insignia, Selector } from "@/components/ui";
import { db } from "@/lib/db";
import { brecha, cumplimiento, madurezPromedio } from "@/lib/erp/decisiones/gobierno";
import { formatoNumero, formatoPct } from "@/lib/erp/dinero";
import { controlReferencia, ETIQUETA_NIVEL_CAPACIDAD } from "@/lib/erp/marcos";
import { puedeOperar } from "@/lib/erp/permisos";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasGobierno, textoParam, type ParamsBusqueda } from "../../_erp/comunes";
import { evaluarControl, sembrarControles } from "../acciones";

export default async function Controles({ searchParams }: { searchParams: ParamsBusqueda }) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContextoErp()]);
  const marco = textoParam(sp.marco) === "ISO27001" ? "ISO27001" : "COBIT";
  const controles = await db.controlGobierno.findMany({ where: { empresaId: ctx.empresa.id, marco }, orderBy: { clave: "asc" } });
  const puede = puedeOperar(ctx.rol, ctx.areas, "GOBIERNO");
  const madurez = madurezPromedio(controles);
  const cumple = cumplimiento(controles);
  const esIso = marco === "ISO27001";
  const dominios = [...new Set(controles.map((c) => c.dominio))];

  return (
    <>
      <EncabezadoPagina
        titulo={esIso ? "ISO/IEC 27001:2022 · Declaración de aplicabilidad" : "COBIT 2019 · Objetivos de gobierno y gestión"}
        descripcion={
          esIso
            ? "Controles del Anexo A que soporta el ERP: aplicabilidad, justificación de exclusiones, nivel de implementación y evidencia."
            : "Autoevaluación del nivel de capacidad (0-5) de los objetivos que soportan los procesos del ERP."
        }
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Gobierno", href: "/gobierno" }, { etiqueta: esIso ? "ISO 27001" : "COBIT" }]}
      />
      <PestanasGobierno actual={`/gobierno/controles?marco=${marco}`} />
      {controles.length === 0 ? (
        <EstadoVacio titulo="Sin controles cargados" accion={puede && <FormaAccion accion={sembrarControles} textoBoton="Cargar controles de referencia" />} />
      ) : (
        <>
          <p className="mb-4 text-sm text-texto-suave">
            Nivel promedio: <strong>{madurez === null ? "—" : formatoNumero(Math.round(madurez * 10) / 10)}</strong> · En nivel objetivo: <strong>{formatoPct(cumple)}</strong> · Aplicables:{" "}
            <strong>
              {controles.filter((c) => c.aplicable).length}/{controles.length}
            </strong>
          </p>
          <div className="space-y-6">
            {dominios.map((d) => (
              <section key={d}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-texto-suave">{d}</h2>
                <div className="space-y-2">
                  {controles
                    .filter((c) => c.dominio === d)
                    .map((c) => {
                      const ref = controlReferencia(c.marco, c.clave);
                      const b = brecha(c);
                      return (
                        <details key={c.id} className="rounded-lg border border-borde bg-superficie">
                          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                            <span className="font-mono text-xs">{c.clave}</span>
                            <span className="font-medium">{c.nombre}</span>
                            {c.procesoErp && <Insignia>{c.procesoErp.toLowerCase()}</Insignia>}
                            <span className="ml-auto flex items-center gap-2">
                              {!c.aplicable ? (
                                <Insignia>No aplicable</Insignia>
                              ) : (
                                <>
                                  <Insignia tono={b === 0 ? "exito" : b === 1 ? "aviso" : "peligro"}>{ETIQUETA_NIVEL_CAPACIDAD[c.nivelActual]}</Insignia>
                                  <span className="text-xs text-texto-suave">objetivo {c.nivelObjetivo}</span>
                                </>
                              )}
                            </span>
                          </summary>
                          <div className="space-y-3 border-t border-borde px-4 py-3">
                            {ref && <p className="text-sm text-texto-suave">Soporte en el ERP: {ref.soporte}</p>}
                            {c.revisadoEn && <p className="text-xs text-texto-suave">Última revisión: {formatoFecha(c.revisadoEn)}</p>}
                            {puede ? (
                              <FormaAccion accion={evaluarControl.bind(null, c.id)} textoBoton="Guardar evaluación" tamano="sm">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                  <Casilla name="aplicable" defaultChecked={c.aplicable} etiqueta="Aplicable" className="sm:col-span-4" />
                                  <Campo etiqueta="Nivel actual" htmlFor={`na-${c.id}`}>
                                    <Selector id={`na-${c.id}`} name="nivelActual" defaultValue={c.nivelActual}>
                                      {[0, 1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>
                                          {ETIQUETA_NIVEL_CAPACIDAD[n]}
                                        </option>
                                      ))}
                                    </Selector>
                                  </Campo>
                                  <Campo etiqueta="Nivel objetivo" htmlFor={`no-${c.id}`}>
                                    <Selector id={`no-${c.id}`} name="nivelObjetivo" defaultValue={c.nivelObjetivo}>
                                      {[0, 1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>
                                          {ETIQUETA_NIVEL_CAPACIDAD[n]}
                                        </option>
                                      ))}
                                    </Selector>
                                  </Campo>
                                  <Campo etiqueta="Responsable" htmlFor={`r-${c.id}`}>
                                    <Entrada id={`r-${c.id}`} name="responsable" defaultValue={c.responsable ?? ""} />
                                  </Campo>
                                  <Campo etiqueta="Justificación (si no aplica)" htmlFor={`j-${c.id}`}>
                                    <Entrada id={`j-${c.id}`} name="justificacion" defaultValue={c.justificacion ?? ""} />
                                  </Campo>
                                  <Campo etiqueta="Evidencia" htmlFor={`e-${c.id}`} className="sm:col-span-4">
                                    <AreaTexto id={`e-${c.id}`} name="evidencia" defaultValue={c.evidencia ?? ""} />
                                  </Campo>
                                </div>
                              </FormaAccion>
                            ) : (
                              <p className="text-sm">{c.evidencia ?? "Sin evidencia registrada."}</p>
                            )}
                          </div>
                        </details>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
