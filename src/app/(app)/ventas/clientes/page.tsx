import Link from "next/link";

import { InsigniaEstado } from "@/components/erp/indicadores";
import { EncabezadoPagina, EnlaceBoton, EstadoVacio, Tabla, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatoPct, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CLIENTE } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasVentas } from "../../_erp/comunes";

export default async function Clientes() {
  const ctx = await obtenerContextoErp();
  const clientes = await db.cliente.findMany({
    where: { empresaId: ctx.empresa.id },
    include: { cuentasPorCobrar: { where: { estado: { in: ["PENDIENTE", "PARCIAL"] } }, select: { saldo: true, fechaVencimiento: true } } },
    orderBy: { razonSocial: "asc" },
  });
  const hoy = new Date();
  const puede = puedeOperar(ctx.rol, ctx.areas, "VENTAS");
  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Líneas de crédito, saldo y uso de crédito por cliente (riesgo de crédito, COBIT APO12)."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Ventas" }, { etiqueta: "Clientes" }]}
        acciones={puede && <EnlaceBoton href="/ventas/clientes/nuevo">+ Nuevo cliente</EnlaceBoton>}
      />
      <PestanasVentas actual="/ventas/clientes" />
      {clientes.length === 0 ? (
        <EstadoVacio titulo="Aún no hay clientes" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Clave</Th>
              <Th>Razón social</Th>
              <Th className="text-right">Límite</Th>
              <Th className="text-right">Saldo</Th>
              <Th className="text-right">Vencido</Th>
              <Th className="text-right">Uso de línea</Th>
              <Th>Crédito</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {clientes.map((c) => {
              const saldo = c.cuentasPorCobrar.reduce((s, x) => s + x.saldo, 0);
              const vencido = c.cuentasPorCobrar.filter((x) => x.fechaVencimiento < hoy).reduce((s, x) => s + x.saldo, 0);
              return (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{c.clave}</Td>
                  <Td>
                    <Link href={`/ventas/clientes/${c.id}`} className="font-medium text-primario hover:underline">
                      {c.razonSocial}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{c.limiteCredito > 0 ? formatoPesos(c.limiteCredito) : "Contado"}</Td>
                  <Td className="text-right tabular-nums">{formatoPesos(saldo)}</Td>
                  <Td className={`text-right tabular-nums ${vencido > 0 ? "text-peligro" : ""}`}>{formatoPesos(vencido)}</Td>
                  <Td className="text-right tabular-nums">{c.limiteCredito > 0 ? formatoPct(saldo / c.limiteCredito) : "—"}</Td>
                  <Td>
                    <InsigniaEstado estado={c.estado} tonos={TONO_CLIENTE} etiquetas={{ ACTIVO: "Activo", SUSPENDIDO: "Suspendido" }} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
