import Link from "next/link";

import { cx, Insignia } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/formularios";
import { ANCLA_SECCION } from "@/lib/solicitudes/presentacion";
import { agruparPorSeccion, SECCION, type Problema, type ResultadoValidacion } from "@/lib/solicitudes/validacion";

import { BotonAccion } from "../../_componentes/boton-accion";

function hrefSeccion(seccion: string): string {
  if (seccion === SECCION.SOLICITANTE) return "/configuracion/empresa";
  return `#${ANCLA_SECCION[seccion] ?? "datos-generales"}`;
}

function ListaProblemas({ problemas, tipo }: { problemas: Problema[]; tipo: "error" | "aviso" }) {
  if (problemas.length === 0) return null;
  return (
    <div className="space-y-2">
      {agruparPorSeccion(problemas).map((g) => (
        <div key={g.seccion}>
          <Link href={hrefSeccion(g.seccion)} className="text-xs font-semibold uppercase tracking-wide text-primario hover:underline">
            {g.seccion}
          </Link>
          <ul className="mt-1 space-y-1">
            {g.problemas.map((p, i) => (
              <li key={i} className={cx("flex gap-1.5 text-sm", tipo === "error" ? "text-texto" : "text-texto-suave")}>
                <span aria-hidden className={tipo === "error" ? "text-peligro" : "text-aviso"}>
                  {tipo === "error" ? "✕" : "!"}
                </span>
                <span>
                  <span className="sr-only">{tipo === "error" ? "Error: " : "Aviso: "}</span>
                  {p.mensaje}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Resumen({ etiqueta, r }: { etiqueta: string; r: ResultadoValidacion }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <span className="flex flex-wrap gap-1">
        {r.lista ? (
          <Insignia tono="exito">Sin errores</Insignia>
        ) : (
          <Insignia tono="peligro">
            {r.errores.length} error{r.errores.length === 1 ? "" : "es"}
          </Insignia>
        )}
        {r.avisos.length > 0 && (
          <Insignia tono="aviso">
            {r.avisos.length} aviso{r.avisos.length === 1 ? "" : "s"}
          </Insignia>
        )}
      </span>
    </div>
  );
}

/** Resultado de validarSolicitud para el portal y para el servicio web, con enlaces a cada sección. */
export function PanelValidacion({
  portal,
  ws,
  borradorEditable,
  accionMarcarLista,
  estado,
}: {
  portal: ResultadoValidacion;
  ws: ResultadoValidacion;
  /** La solicitud es un borrador y el usuario puede editarla. */
  borradorEditable: boolean;
  accionMarcarLista: (previo: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  estado: string;
}) {
  const clave = (p: Problema) => `${p.seccion}|${p.mensaje}`;
  const enPortal = new Set([...portal.errores, ...portal.avisos].map(clave));
  const soloWsErrores = ws.errores.filter((p) => !enPortal.has(clave(p)));
  const soloWsAvisos = ws.avisos.filter((p) => !enPortal.has(clave(p)));

  return (
    <section aria-labelledby="titulo-validacion" className="rounded-lg border border-borde bg-superficie shadow-sm">
      <header className="border-b border-borde px-4 py-3">
        <h2 id="titulo-validacion" className="text-base font-semibold">
          Validación previa
        </h2>
        <p className="text-xs text-texto-suave">Contra el Manual WS 260211 y los requisitos del trámite.</p>
      </header>
      <div className="space-y-4 px-4 py-3">
        <div className="space-y-1.5">
          <Resumen etiqueta="Portal VUCEM" r={portal} />
          <Resumen etiqueta="Servicio web" r={ws} />
        </div>

        {estado === "LISTA" && <p className="rounded-md bg-primario-suave px-3 py-2 text-sm text-primario">Marcada como lista para presentar.</p>}
        {borradorEditable && portal.lista && (
          <BotonAccion accion={accionMarcarLista} variante="primario" tamano="md" textoEnviando="Revisando…">
            Marcar como lista
          </BotonAccion>
        )}
        {borradorEditable && !portal.lista && (
          <p className="text-xs text-texto-suave">Cuando no haya errores podrás marcarla como lista para presentar.</p>
        )}

        {portal.errores.length === 0 && portal.avisos.length === 0 && soloWsErrores.length === 0 && soloWsAvisos.length === 0 ? (
          <p className="text-sm text-exito">Todo en orden.</p>
        ) : (
          <>
            <ListaProblemas problemas={portal.errores} tipo="error" />
            <ListaProblemas problemas={portal.avisos} tipo="aviso" />
            {(soloWsErrores.length > 0 || soloWsAvisos.length > 0) && (
              <div className="space-y-2 border-t border-borde pt-3">
                <p className="text-xs font-semibold text-texto-suave">Adicional para el envío por servicio web</p>
                <ListaProblemas problemas={soloWsErrores} tipo="error" />
                <ListaProblemas problemas={soloWsAvisos} tipo="aviso" />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
