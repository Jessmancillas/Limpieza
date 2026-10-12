import Link from "next/link";

import { EnlaceBoton, Insignia } from "@/components/ui";
import type { TipoTercero } from "@/lib/constantes";
import type { SolicitudCompleta } from "@/lib/solicitudes/consultas";
import { ORDEN_TERCEROS } from "@/lib/solicitudes/hoja-captura";
import { nombreTercero } from "@/lib/validacion/tercero";

import { agregarTercero, quitarTercero } from "../../acciones-relaciones";
import { BotonAccion } from "../../_componentes/boton-accion";
import { FormAgregarTercero } from "./formularios-varios";

export type TerceroCandidato = { id: string; tipo: string; nombre: string; detalle: string };

const INFO_ROL: Record<TipoTercero, { titulo: string; singular: string; requerido: boolean; ayuda: string }> = {
  FABRICANTE: { titulo: "Fabricantes", singular: "Fabricante", requerido: true, ayuda: "Al agregar una mercancía se agrega el fabricante de su producto." },
  DESTINATARIO: { titulo: "Destinatario", singular: "Destinatario", requerido: true, ayuda: "Destino final de la mercancía en México (requiere RFC)." },
  PROVEEDOR: { titulo: "Proveedores", singular: "Proveedor", requerido: false, ayuda: "Quien vende la mercancía, si es distinto del fabricante." },
  FACTURADOR: { titulo: "Facturadores", singular: "Facturador", requerido: false, ayuda: "Quien emite la factura, si es distinto del proveedor." },
};

export function SeccionTerceros({
  sol,
  candidatos,
  editable,
  nuevoTerceroId,
}: {
  sol: SolicitudCompleta;
  candidatos: TerceroCandidato[];
  editable: boolean;
  nuevoTerceroId?: string;
}) {
  const volver = encodeURIComponent(`/solicitudes/${sol.id}`);
  return (
    <div className="space-y-6">
      {ORDEN_TERCEROS.map((rol) => {
        const info = INFO_ROL[rol];
        const ligados = sol.terceros.filter((t) => t.rol === rol);
        const ids = new Set(ligados.map((t) => t.terceroId));
        const opciones = candidatos.filter((c) => c.tipo === rol && !ids.has(c.id));
        return (
          <div key={rol} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {info.titulo}{" "}
                {info.requerido ? (
                  <Insignia tono={ligados.length ? "exito" : "peligro"}>Requerido</Insignia>
                ) : (
                  <Insignia>Opcional</Insignia>
                )}
              </h3>
              {editable && (
                <EnlaceBoton href={`/terceros/nuevo?tipo=${rol}&volver=${volver}`} variante="fantasma" tamano="sm">
                  + Nuevo {info.singular.toLowerCase()}
                </EnlaceBoton>
              )}
            </div>
            <p className="text-xs text-texto-suave">{info.ayuda}</p>
            {ligados.length === 0 ? (
              <p className="text-sm text-texto-suave">Ninguno.</p>
            ) : (
              <ul className="divide-y divide-borde rounded-md border border-borde">
                {ligados.map((st) => {
                  const t = st.tercero;
                  return (
                    <li key={st.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <Link href={`/terceros/${t.id}`} className="font-medium text-primario hover:underline">
                          {nombreTercero(t)}
                        </Link>
                        <span className="block text-xs text-texto-suave">
                          {[t.rfc, t.pais, t.entidadFederativa, t.correoElectronico].filter(Boolean).join(" · ")}
                          {!t.activo && " · inactivo"}
                        </span>
                      </span>
                      {editable && (
                        <BotonAccion accion={quitarTercero.bind(null, sol.id, st.id)} variante="fantasma" textoEnviando="Quitando…">
                          Quitar
                        </BotonAccion>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && opciones.length > 0 && (
              <FormAgregarTercero
                accion={agregarTercero.bind(null, sol.id)}
                rol={rol}
                etiqueta={info.singular}
                opciones={opciones}
                preseleccion={opciones.some((o) => o.id === nuevoTerceroId) ? nuevoTerceroId : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
