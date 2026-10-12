import Link from "next/link";

import { EnlaceBoton, Insignia } from "@/components/ui";
import { ETIQUETA_TIPO_DOCUMENTO, type TipoDocumento } from "@/lib/constantes";
import { formatoFecha } from "@/lib/formularios";
import type { SolicitudCompleta } from "@/lib/solicitudes/consultas";
import { diasNaturalesHasta } from "@/lib/solicitudes/fechas";
import type { DefinicionTramite } from "@/lib/tramite/definicion";

import { desligarDocumento, ligarDocumento } from "../../acciones-relaciones";
import { BotonAccion } from "../../_componentes/boton-accion";
import { FormLigarDocumento } from "./formularios-varios";

/** Documento de la empresa que se puede ligar. */
export type DocumentoCandidato = {
  id: string;
  tipo: string;
  nombre: string;
  productoId: string | null;
  establecimientoId: string | null;
  estadoConversion: string;
  vigenciaHasta: Date | null;
  producto: { denominacionEspecifica: string } | null;
};

/** Tipos de documento propios del establecimiento (se suben con ?establecimientoId=). */
const TIPOS_ESTABLECIMIENTO = new Set(["LICENCIA_SANITARIA", "AVISO_FUNCIONAMIENTO", "AVISO_RESPONSABLE"]);

const etiquetaTipo = (t: string) => ETIQUETA_TIPO_DOCUMENTO[t as TipoDocumento] ?? t;

function InsigniaConversion({ estado }: { estado: string }) {
  switch (estado) {
    case "OK":
      return <Insignia tono="exito">PDF VUCEM listo</Insignia>;
    case "ADVERTENCIA":
      return <Insignia tono="aviso">PDF listo con advertencias</Insignia>;
    case "ERROR":
      return <Insignia tono="peligro">Conversión fallida</Insignia>;
    default:
      return <Insignia>Pendiente de convertir</Insignia>;
  }
}

function InsigniaEDocument({ estado, eDocument }: { estado: string; eDocument: string | null }) {
  if (eDocument) return <Insignia tono="info">eDocument {eDocument}</Insignia>;
  if (estado === "ERROR") return <Insignia tono="peligro">Digitalización con error</Insignia>;
  if (estado === "PENDIENTE") return <Insignia tono="aviso">Digitalización pendiente</Insignia>;
  return <Insignia>Sin eDocument</Insignia>;
}

export function SeccionDocumentos({
  sol,
  definicion,
  candidatos,
  editable,
  preseleccion = {},
}: {
  sol: SolicitudCompleta;
  definicion: DefinicionTramite | null;
  candidatos: DocumentoCandidato[];
  editable: boolean;
  /** Documento a preseleccionar por requisito (al regresar de "Subir nuevo"). */
  preseleccion?: Partial<Record<string, string>>;
}) {
  if (!definicion) {
    return <p className="text-sm text-peligro">La definición del trámite no es válida: no se pueden mostrar los requisitos.</p>;
  }
  const ligados = new Set(sol.documentos.map((d) => d.documentoId));
  const productos = new Map<string, string>();
  for (const p of sol.partidas) if (p.productoId) productos.set(p.productoId, p.denominacionEspecifica);
  // Al regresar de subir el documento (?requisito=) se preselecciona para ligarlo.
  const hrefSubir = (requisito: string, tipo: string, productoId?: string) => {
    const params = [`tipo=${encodeURIComponent(tipo)}`];
    if (productoId) params.push(`productoId=${encodeURIComponent(productoId)}`);
    else if (TIPOS_ESTABLECIMIENTO.has(tipo) && sol.establecimientoId) params.push(`establecimientoId=${encodeURIComponent(sol.establecimientoId)}`);
    params.push(`volver=${encodeURIComponent(`/solicitudes/${sol.id}?requisito=${encodeURIComponent(requisito)}`)}`);
    return `/documentos/nuevo?${params.join("&")}`;
  };
  const maxBytes = definicion.limitesPdf.maxMB * 1_000_000;

  return (
    <div className="space-y-6">
      <p className="text-sm text-texto-suave">
        PDF máximo de {definicion.limitesPdf.maxMB} MB, a {definicion.limitesPdf.minDpi} dpi en escala de grises (la app convierte los
        documentos al subirlos).
      </p>
      {definicion.requisitos.map((req) => {
        const deRequisito = sol.documentos.filter((d) => d.requisito === req.clave);
        const opciones = candidatos
          .filter((c) => (req.tipos as readonly string[]).includes(c.tipo) && !ligados.has(c.id))
          .sort((a, b) => {
            const relevante = (c: DocumentoCandidato) =>
              req.porProducto ? (c.productoId && productos.has(c.productoId) ? 0 : 1) : c.establecimientoId === sol.establecimientoId ? 0 : 1;
            return relevante(a) - relevante(b) || a.nombre.localeCompare(b.nombre, "es");
          })
          .map((c) => {
            const dias = c.vigenciaHasta ? diasNaturalesHasta(c.vigenciaHasta) : null;
            const partes = [
              c.nombre,
              req.tipos.length > 1 ? etiquetaTipo(c.tipo) : null,
              c.producto?.denominacionEspecifica ?? null,
              dias !== null && dias < 0 ? "VENCIDO" : null,
              c.estadoConversion === "ERROR" ? "conversión fallida" : c.estadoConversion === "PENDIENTE" ? "sin convertir" : null,
            ].filter(Boolean);
            return { id: c.id, etiqueta: partes.join(" · ") };
          });
        const productosSinDocumento = req.porProducto
          ? [...productos.entries()].filter(([pid]) => !deRequisito.some((d) => d.documento.productoId === pid))
          : [];

        return (
          <article key={req.clave} className="rounded-md border border-borde p-4" aria-labelledby={`req-${req.clave}`}>
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id={`req-${req.clave}`} className="text-sm font-semibold">
                  {req.nombre}
                </h3>
                <p className="text-xs text-texto-suave">
                  {req.tipos.map(etiquetaTipo).join(" o ")}
                  {req.porProducto && " · uno por cada producto"}
                </p>
                {req.nota && <p className="mt-1 text-xs text-texto-suave">{req.nota}</p>}
              </div>
              {req.obligatorio ? <Insignia tono={deRequisito.length ? "exito" : "peligro"}>Obligatorio</Insignia> : <Insignia>Opcional</Insignia>}
            </header>

            {deRequisito.length > 0 && (
              <ul className="mt-3 divide-y divide-borde rounded-md border border-borde">
                {deRequisito.map((sd) => {
                  const d = sd.documento;
                  const dias = d.vigenciaHasta ? diasNaturalesHasta(d.vigenciaHasta) : null;
                  return (
                    <li key={sd.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0 space-y-1">
                        <Link href={`/documentos/${d.id}`} className="font-medium text-primario hover:underline">
                          {d.nombre}
                        </Link>
                        <p className="text-xs text-texto-suave">
                          {etiquetaTipo(d.tipo)}
                          {d.productoId && productos.has(d.productoId) && ` · ${productos.get(d.productoId)}`}
                          {d.archivoVucemBytes != null && ` · ${(d.archivoVucemBytes / 1_000_000).toFixed(2)} MB`}
                          {d.paginas != null && ` · ${d.paginas} pág.`}
                          {d.vigenciaHasta && ` · vigente hasta ${formatoFecha(d.vigenciaHasta)}`}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <InsigniaConversion estado={d.estadoConversion} />
                          <InsigniaEDocument estado={d.estadoEDocument} eDocument={d.eDocument} />
                          {dias !== null && dias < 0 && <Insignia tono="peligro">Vencido</Insignia>}
                          {d.archivoVucemBytes != null && d.archivoVucemBytes > maxBytes && <Insignia tono="peligro">Excede {definicion.limitesPdf.maxMB} MB</Insignia>}
                        </div>
                      </div>
                      {editable && (
                        <BotonAccion accion={desligarDocumento.bind(null, sol.id, sd.id)} variante="fantasma" textoEnviando="Desligando…">
                          Desligar
                        </BotonAccion>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {deRequisito.length === 0 && <p className="mt-3 text-sm text-texto-suave">Sin documentos ligados.</p>}

            {productosSinDocumento.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {productosSinDocumento.map(([pid, nombre]) => (
                  <li key={pid} className="flex flex-wrap items-center gap-2">
                    <span className="text-aviso">Falta para «{nombre}».</span>
                    {editable && (
                      <Link href={hrefSubir(req.clave, req.tipos[0], pid)} className="text-primario hover:underline">
                        Subir documento de este producto
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editable && (
              <div className="mt-3 space-y-2">
                {opciones.length > 0 && (
                  <FormLigarDocumento
                    accion={ligarDocumento.bind(null, sol.id)}
                    requisito={req.clave}
                    opciones={opciones}
                    preseleccion={opciones.some((o) => o.id === preseleccion[req.clave]) ? preseleccion[req.clave] : undefined}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {req.tipos.map((t) => (
                    <EnlaceBoton key={t} href={hrefSubir(req.clave, t)} variante="fantasma" tamano="sm">
                      Subir nuevo{req.tipos.length > 1 ? `: ${etiquetaTipo(t).toLowerCase()}` : ""}
                    </EnlaceBoton>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}

      {sol.documentos.some((sd) => !definicion.requisitos.some((r) => r.clave === sd.requisito)) && (
        <article className="rounded-md border border-borde p-4">
          <h3 className="text-sm font-semibold">Documentos de requisitos que ya no existen</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {sol.documentos
              .filter((sd) => !definicion.requisitos.some((r) => r.clave === sd.requisito))
              .map((sd) => (
                <li key={sd.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {sd.documento.nombre} <span className="text-xs text-texto-suave">({sd.requisito})</span>
                  </span>
                  {editable && (
                    <BotonAccion accion={desligarDocumento.bind(null, sol.id, sd.id)} variante="fantasma" textoEnviando="Desligando…">
                      Desligar
                    </BotonAccion>
                  )}
                </li>
              ))}
          </ul>
        </article>
      )}
    </div>
  );
}
