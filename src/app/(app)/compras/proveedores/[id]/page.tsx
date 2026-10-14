import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado, Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { Aviso, EncabezadoPagina, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_OC, type EstadoOC } from "@/lib/erp/constantes";
import { PESOS_EVALUACION_PROVEEDOR } from "@/lib/erp/decisiones/compras";
import { formatoPct, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_OC } from "@/lib/erp/presentacion";
import { evaluarProveedores } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { cambiarEstadoProveedor, guardarProveedor } from "../../acciones";
import { CamposProveedor } from "../campos";

export default async function DetalleProveedor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const p = await db.proveedor.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: { ordenesCompra: { orderBy: { numero: "desc" }, take: 20 } },
  });
  if (!p) notFound();
  const e = (await evaluarProveedores(ctx.empresa.id)).get(p.id) ?? null;
  const puede = puedeOperar(ctx.rol, ctx.areas, "COMPRAS");
  const W = PESOS_EVALUACION_PROVEEDOR;

  return (
    <>
      <EncabezadoPagina
        titulo={p.razonSocial}
        descripcion={`Clave ${p.clave}${p.rfc ? ` · RFC ${p.rfc}` : ""}`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Proveedores", href: "/compras/proveedores" }, { etiqueta: p.clave }]}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Evaluación de desempeño (scorecard)" descripcion={`Ponderación: calidad ${W.calidad * 100} %, puntualidad ${W.puntualidad * 100} %, cumplimiento ${W.cumplimiento * 100} %, facturación correcta ${W.facturacion * 100} %.`}>
          {e ? (
            <div className="space-y-4">
              <RejillaKpi>
                <Kpi titulo="Puntaje" valor={`${e.puntaje} · ${e.clase}`} detalle={e.recomendacion} marco="COBIT APO10" />
                <Kpi titulo="Calidad" valor={formatoPct(e.calidad)} detalle="Sin rechazos en recepción" />
                <Kpi titulo="Puntualidad" valor={formatoPct(e.puntualidad)} detalle="Recepciones a tiempo" />
                <Kpi titulo="Cumplimiento" valor={formatoPct(e.cumplimiento)} detalle={`Fill rate · facturación ${formatoPct(e.facturacion)}`} />
              </RejillaKpi>
              {e.clase === "D" && p.estado !== "BLOQUEADO" && <Aviso tono="peligro">El modelo recomienda bloquear a este proveedor.</Aviso>}
            </div>
          ) : (
            <p className="text-sm text-texto-suave">Sin recepciones todavía: la evaluación se calcula con el historial de entregas.</p>
          )}
        </Tarjeta>

        {puede && (
          <Tarjeta titulo="Estado" descripcion="Un proveedor bloqueado no puede recibir nuevas órdenes de compra.">
            <FormaAccion accion={cambiarEstadoProveedor.bind(null, p.id)} textoBoton="Cambiar estado" variante="secundario" className="flex flex-wrap items-end gap-3 space-y-0">
              <Selector name="estado" defaultValue={p.estado} className="w-56" aria-label="Estado del proveedor">
                <option value="ACTIVO">Activo</option>
                <option value="EN_EVALUACION">En evaluación</option>
                <option value="BLOQUEADO">Bloqueado</option>
              </Selector>
            </FormaAccion>
          </Tarjeta>
        )}

        <Tarjeta titulo="Órdenes de compra recientes">
          {p.ordenesCompra.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin órdenes.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>OC</Th>
                  <Th>Fecha</Th>
                  <Th>Total</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {p.ordenesCompra.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`/compras/ordenes/${o.id}`} className="text-primario hover:underline">
                        #{o.numero}
                      </Link>
                    </Td>
                    <Td>{formatoFecha(o.creadoEn)}</Td>
                    <Td>{formatoPesos(o.total)}</Td>
                    <Td>
                      <InsigniaEstado estado={o.estado} tonos={TONO_OC} etiquetas={ETIQUETA_ESTADO_OC as Record<EstadoOC, string>} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puede && (
          <Tarjeta titulo="Datos del proveedor">
            <FormaAccion accion={guardarProveedor.bind(null, p.id)}>
              <CamposProveedor v={p} />
            </FormaAccion>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
