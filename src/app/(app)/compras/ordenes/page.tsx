import Link from "next/link";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado } from "@/components/erp/indicadores";
import { Campo, cx, EncabezadoPagina, Entrada, EstadoVacio, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { enLista, ESTADOS_OC, ETIQUETA_ESTADO_OC } from "@/lib/erp/constantes";
import { ETIQUETA_NIVEL_APROBACION } from "@/lib/erp/decisiones/compras";
import { formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_OC } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasCompras, textoParam, type ParamsBusqueda } from "../../_erp/comunes";
import { crearOrdenCompra } from "../acciones";

export default async function OrdenesCompra({ searchParams }: { searchParams: ParamsBusqueda }) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContextoErp()]);
  const estadoParam = textoParam(sp.estado);
  const estado = enLista(ESTADOS_OC, estadoParam) ? estadoParam : null;
  const [ordenes, proveedores, almacenes, conteos] = await Promise.all([
    db.ordenCompra.findMany({
      where: { empresaId: ctx.empresa.id, ...(estado ? { estado } : {}) },
      include: { proveedor: { select: { razonSocial: true } }, almacen: { select: { clave: true } } },
      orderBy: { numero: "desc" },
      take: 200,
    }),
    db.proveedor.findMany({ where: { empresaId: ctx.empresa.id, estado: { not: "BLOQUEADO" } }, orderBy: { razonSocial: "asc" } }),
    db.almacen.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { clave: "asc" } }),
    db.ordenCompra.groupBy({ by: ["estado"], where: { empresaId: ctx.empresa.id }, _count: { _all: true } }),
  ]);
  const conteo = new Map(conteos.map((c) => [c.estado, c._count._all]));
  const puede = puedeOperar(ctx.rol, ctx.areas, "COMPRAS");

  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes de compra"
        descripcion="Ciclo procure-to-pay: elaboración → autorización por monto → recepción → conciliación a tres vías → pago."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Compras" }, { etiqueta: "Órdenes de compra" }]}
      />
      <PestanasCompras actual="/compras/ordenes" />

      {puede && (
        <Tarjeta
          titulo="Nueva orden de compra"
          descripcion={`Autorización: hasta ${formatoPesos(ctx.config.montoAutoAprobacion)} ${ETIQUETA_NIVEL_APROBACION[0].toLowerCase()}; hasta ${formatoPesos(ctx.config.montoAprobacionNivel1)} un aprobador; más, dirección.`}
          className="mb-6"
        >
          {proveedores.length === 0 || almacenes.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Primero da de alta{" "}
              {proveedores.length === 0 && (
                <Link href="/compras/proveedores/nuevo" className="text-primario hover:underline">
                  un proveedor
                </Link>
              )}
              {proveedores.length === 0 && almacenes.length === 0 && " y "}
              {almacenes.length === 0 && (
                <Link href="/almacen/almacenes" className="text-primario hover:underline">
                  un almacén
                </Link>
              )}
              .
            </p>
          ) : (
            <FormaAccion accion={crearOrdenCompra} textoBoton="Crear borrador">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Campo etiqueta="Proveedor" htmlFor="proveedorId" requerido>
                  <Selector id="proveedorId" name="proveedorId" required defaultValue="">
                    <option value="" disabled>
                      Elige…
                    </option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.clave} · {p.razonSocial}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Almacén destino" htmlFor="almacenId" requerido>
                  <Selector id="almacenId" name="almacenId" required>
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.clave} · {a.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Fecha de entrega comprometida" htmlFor="fechaEntrega" ayuda="Mide la puntualidad del proveedor.">
                  <Entrada id="fechaEntrega" name="fechaEntrega" type="date" />
                </Campo>
              </div>
            </FormaAccion>
          )}
        </Tarjeta>
      )}

      <nav aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-1">
        {[null, ...ESTADOS_OC].map((e) => (
          <Link
            key={e ?? "todas"}
            href={e ? `/compras/ordenes?estado=${e}` : "/compras/ordenes"}
            aria-current={e === estado ? "page" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-sm",
              e === estado ? "border-primario bg-primario-suave font-medium text-primario" : "border-borde bg-superficie hover:bg-fondo",
            )}
          >
            {e ? ETIQUETA_ESTADO_OC[e] : "Todas"}
            {e && <span className="text-xs text-texto-suave"> ({conteo.get(e) ?? 0})</span>}
          </Link>
        ))}
      </nav>

      {ordenes.length === 0 ? (
        <EstadoVacio titulo="Sin órdenes de compra" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>OC</Th>
              <Th>Proveedor</Th>
              <Th>Almacén</Th>
              <Th>Fecha</Th>
              <Th>Entrega</Th>
              <Th className="text-right">Total</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {ordenes.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`/compras/ordenes/${o.id}`} className="font-medium text-primario hover:underline">
                    #{o.numero}
                  </Link>
                </Td>
                <Td>{o.proveedor.razonSocial}</Td>
                <Td className="font-mono text-xs">{o.almacen.clave}</Td>
                <Td>{formatoFecha(o.creadoEn)}</Td>
                <Td>{formatoFecha(o.fechaEntrega)}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(o.total)}</Td>
                <Td>
                  <InsigniaEstado estado={o.estado} tonos={TONO_OC} etiquetas={ETIQUETA_ESTADO_OC} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
