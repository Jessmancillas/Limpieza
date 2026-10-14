import Link from "next/link";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado } from "@/components/erp/indicadores";
import { Campo, EncabezadoPagina, EstadoVacio, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_PEDIDO } from "@/lib/erp/constantes";
import { formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_PEDIDO } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasVentas } from "../../_erp/comunes";
import { crearPedido } from "../acciones";

export default async function Pedidos() {
  const ctx = await obtenerContextoErp();
  const [pedidos, clientes, almacenes] = await Promise.all([
    db.pedidoVenta.findMany({ where: { empresaId: ctx.empresa.id }, include: { cliente: { select: { razonSocial: true } } }, orderBy: { numero: "desc" }, take: 200 }),
    db.cliente.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: { razonSocial: "asc" } }),
    db.almacen.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { clave: "asc" } }),
  ]);
  const puede = puedeOperar(ctx.rol, ctx.areas, "VENTAS");
  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos de venta"
        descripcion="Order-to-cash: pedido → decisión de crédito → surtido (salida de inventario) → cuenta por cobrar → cobranza."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Ventas" }, { etiqueta: "Pedidos" }]}
      />
      <PestanasVentas actual="/ventas/pedidos" />
      {puede && clientes.length > 0 && almacenes.length > 0 && (
        <Tarjeta titulo="Nuevo pedido" className="mb-6">
          <FormaAccion accion={crearPedido} textoBoton="Crear borrador">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo etiqueta="Cliente" htmlFor="clienteId" requerido>
                <Selector id="clienteId" name="clienteId" required defaultValue="">
                  <option value="" disabled>
                    Elige…
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clave} · {c.razonSocial}
                      {c.estado === "SUSPENDIDO" ? " (crédito suspendido)" : ""}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Almacén de surtido" htmlFor="almacenId" requerido>
                <Selector id="almacenId" name="almacenId" required>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.clave} · {a.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Condición de pago" htmlFor="condicionPago" requerido>
                <Selector id="condicionPago" name="condicionPago" required>
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Crédito</option>
                </Selector>
              </Campo>
            </div>
          </FormaAccion>
        </Tarjeta>
      )}
      {pedidos.length === 0 ? (
        <EstadoVacio titulo="Sin pedidos" descripcion={clientes.length === 0 ? "Da de alta clientes para capturar pedidos." : undefined} />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Fecha</Th>
              <Th>Condición</Th>
              <Th className="text-right">Total</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {pedidos.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/ventas/pedidos/${p.id}`} className="font-medium text-primario hover:underline">
                    #{p.numero}
                  </Link>
                </Td>
                <Td>{p.cliente.razonSocial}</Td>
                <Td>{formatoFecha(p.creadoEn)}</Td>
                <Td>{p.condicionPago === "CREDITO" ? "Crédito" : "Contado"}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(p.total)}</Td>
                <Td>
                  <InsigniaEstado estado={p.estado} tonos={TONO_PEDIDO} etiquetas={ETIQUETA_ESTADO_PEDIDO} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
