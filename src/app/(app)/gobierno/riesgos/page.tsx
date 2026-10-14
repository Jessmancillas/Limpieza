import { FormaAccion } from "@/components/erp/forma-accion";
import { cx, EncabezadoPagina, EstadoVacio, Insignia, Tarjeta } from "@/components/ui";
import { db } from "@/lib/db";
import { APETITO_RIESGO, INFO_NIVEL_RIESGO, nivelRiesgo, valorRiesgo } from "@/lib/erp/decisiones/riesgos";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_NIVEL_RIESGO } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasGobierno } from "../../_erp/comunes";
import { guardarRiesgo } from "../acciones";
import { CamposRiesgo } from "./campos";

const COLOR_NIVEL = { BAJO: "bg-exito-suave", MEDIO: "bg-info-suave", ALTO: "bg-aviso-suave", CRITICO: "bg-peligro-suave" } as const;

export default async function Riesgos() {
  const ctx = await obtenerContextoErp();
  const riesgos = await db.riesgoSeguridad.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: { numero: "asc" } });
  const abiertos = riesgos.filter((r) => r.estado !== "CERRADO");
  const puede = puedeOperar(ctx.rol, ctx.areas, "GOBIERNO");
  const ordenados = [...riesgos].sort((a, b) => valorRiesgo(b.probabilidad, b.impacto) - valorRiesgo(a.probabilidad, a.impacto));

  return (
    <>
      <EncabezadoPagina
        titulo="Riesgos de seguridad de la información"
        descripcion={`Evaluación y tratamiento (ISO/IEC 27001 6.1.2 / 6.1.3, ISO/IEC 27005). Matriz 5 × 5; apetito de riesgo: p × i ≤ ${APETITO_RIESGO}.`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Gobierno", href: "/gobierno" }, { etiqueta: "Riesgos" }]}
      />
      <PestanasGobierno actual="/gobierno/riesgos" />
      <div className="space-y-6">
        <Tarjeta titulo="Mapa de calor (riesgos abiertos)">
          <div className="overflow-x-auto">
            <table className="text-center text-xs">
              <tbody>
                {[5, 4, 3, 2, 1].map((p) => (
                  <tr key={p}>
                    <th scope="row" className="pr-2 font-normal text-texto-suave">
                      P{p}
                    </th>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const n = abiertos.filter((r) => r.probabilidad === p && r.impacto === i).length;
                      return (
                        <td key={i} className={cx("size-12 border border-superficie font-semibold", COLOR_NIVEL[nivelRiesgo(p * i)])}>
                          {n > 0 ? n : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <td key={i} className="pt-1 text-texto-suave">
                      I{i}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="mt-3 grid gap-1 text-xs text-texto-suave sm:grid-cols-2">
            {(Object.keys(INFO_NIVEL_RIESGO) as Array<keyof typeof INFO_NIVEL_RIESGO>).map((n) => (
              <li key={n}>
                <Insignia tono={TONO_NIVEL_RIESGO[n]}>{n.toLowerCase()}</Insignia> {INFO_NIVEL_RIESGO[n].tratamiento} Plazo: {INFO_NIVEL_RIESGO[n].plazoDias} días.
              </li>
            ))}
          </ul>
        </Tarjeta>

        {puede && (
          <Tarjeta titulo="Registrar riesgo">
            <FormaAccion accion={guardarRiesgo.bind(null, null)} textoBoton="Registrar riesgo" reiniciar>
              <CamposRiesgo />
            </FormaAccion>
          </Tarjeta>
        )}

        {ordenados.length === 0 ? (
          <EstadoVacio titulo="Sin riesgos registrados" />
        ) : (
          <div className="space-y-2">
            {ordenados.map((r) => {
              const valor = valorRiesgo(r.probabilidad, r.impacto);
              const nivel = nivelRiesgo(valor);
              const residual = r.probabilidadResidual && r.impactoResidual ? valorRiesgo(r.probabilidadResidual, r.impactoResidual) : null;
              return (
                <details key={r.id} className="rounded-lg border border-borde bg-superficie">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <span className="font-mono text-xs">R-{r.numero}</span>
                    <span className="font-medium">{r.activo}</span>
                    <span className="text-texto-suave">· {r.amenaza}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Insignia tono={TONO_NIVEL_RIESGO[nivel]}>{`${nivel.toLowerCase()} · ${valor}`}</Insignia>
                      {residual !== null && <Insignia tono={TONO_NIVEL_RIESGO[nivelRiesgo(residual)]}>{`residual ${residual}`}</Insignia>}
                      <Insignia>{r.tratamiento.toLowerCase()}</Insignia>
                      <Insignia tono={r.estado === "CERRADO" ? "exito" : "neutro"}>{r.estado.toLowerCase().replace("_", " ")}</Insignia>
                    </span>
                  </summary>
                  <div className="border-t border-borde px-4 py-3">
                    {puede ? (
                      <FormaAccion accion={guardarRiesgo.bind(null, r.id)} textoBoton="Guardar cambios" tamano="sm">
                        <CamposRiesgo v={r} sufijo={`-${r.id}`} />
                      </FormaAccion>
                    ) : (
                      <p className="text-sm">
                        Vulnerabilidad: {r.vulnerabilidad}. Controles: {r.controles ?? "—"}. Dueño: {r.responsable ?? "—"}.
                      </p>
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
