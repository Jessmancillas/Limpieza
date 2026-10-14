import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado, Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { EncabezadoPagina, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { evaluarCredito } from "@/lib/erp/decisiones/credito";
import { diasVencido } from "@/lib/erp/decisiones/cobranza";
import { formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CLIENTE, TONO_CUENTA, TONO_DECISION } from "@/lib/erp/presentacion";
import { entradaCreditoCliente } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { cambiarEstadoCliente, guardarCliente } from "../../acciones";
import { CamposCliente } from "../campos";

export default async function DetalleCliente({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const c = await db.cliente.findFirst({ where: { id, empresaId: ctx.empresa.id }, include: { cuentasPorCobrar: { orderBy: { fechaEmision: "desc" }, take: 30 } } });
  if (!c) notFound();
  const hoy = new Date();
  const entrada = (await entradaCreditoCliente(ctx.empresa.id, c.id, 0, hoy))!;
  const evaluacion = evaluarCredito(entrada, ctx.config);
  const disponible = Math.max(0, c.limiteCredito - entrada.saldoActual);

  return (
    <>
      <EncabezadoPagina
        titulo={c.razonSocial}
        descripcion={`Clave ${c.clave}${c.rfc ? ` · RFC ${c.rfc}` : ""}`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Clientes", href: "/ventas/clientes" }, { etiqueta: c.clave }]}
        acciones={<InsigniaEstado estado={c.estado} tonos={TONO_CLIENTE} etiquetas={{ ACTIVO: "Crédito activo", SUSPENDIDO: "Crédito suspendido" }} />}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Modelo de decisión de crédito" descripcion={`Aprobación automática con puntaje ≥ ${ctx.config.puntajeCreditoMinimo}; revisión ≥ ${ctx.config.puntajeCreditoRevision}; gracia ${ctx.config.diasGraciaCredito} días.`}>
          <RejillaKpi>
            <Kpi titulo="Puntaje actual" valor={evaluacion.puntaje} detalle={<Insignia tono={TONO_DECISION[evaluacion.decision]}>{evaluacion.decision}</Insignia>} marco="COBIT APO12" />
            <Kpi titulo="Línea / disponible" valor={formatoPesos(disponible)} detalle={`Límite ${formatoPesos(c.limiteCredito)} · ${c.diasCredito} días`} />
            <Kpi titulo="Saldo" valor={formatoPesos(entrada.saldoActual)} detalle={`${Math.round(entrada.fraccionVencida * 100)} % vencido · máx. ${entrada.maxDiasVencido} días`} />
            <Kpi titulo="Hábito de pago" valor={`${Math.round(entrada.atrasoPromedioPago)} días`} detalle={`Atraso promedio en ${entrada.facturasPagadas} facturas pagadas`} />
          </RejillaKpi>
          <ul className="mt-3 list-inside list-disc text-sm text-texto-suave">
            {evaluacion.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {puedeOperar(ctx.rol, ctx.areas, "COBRANZA") && (
            <div className="mt-3">
              <FormaAccion accion={cambiarEstadoCliente.bind(null, c.id)} textoBoton={c.estado === "SUSPENDIDO" ? "Reactivar crédito" : "Suspender crédito"} variante="secundario" tamano="sm" />
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Cuentas por cobrar">
          {c.cuentasPorCobrar.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin cuentas.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Emisión</Th>
                  <Th>Vence</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {c.cuentasPorCobrar.map((x) => (
                  <tr key={x.id}>
                    <Td>
                      <Link href={`/cobranza/${x.id}`} className="text-primario hover:underline">
                        {x.folio}
                      </Link>
                    </Td>
                    <Td>{formatoFecha(x.fechaEmision)}</Td>
                    <Td>
                      {formatoFecha(x.fechaVencimiento)}
                      {x.saldo > 0 && diasVencido(x.fechaVencimiento, hoy) > 0 && <span className="block text-xs text-peligro">{diasVencido(x.fechaVencimiento, hoy)} días vencida</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{formatoPesos(x.total)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(x.saldo)}</Td>
                    <Td>
                      <Insignia tono={TONO_CUENTA[x.estado]}>{x.estado.toLowerCase()}</Insignia>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puedeOperar(ctx.rol, ctx.areas, "VENTAS") && (
          <Tarjeta titulo="Datos del cliente">
            <FormaAccion accion={guardarCliente.bind(null, c.id)}>
              <CamposCliente v={c} />
            </FormaAccion>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
