import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Aviso, Campo, Datos, EncabezadoPagina, Entrada, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_GESTION, METODOS_PAGO, TIPOS_GESTION, type TipoGestion } from "@/lib/erp/constantes";
import { accionSugerida, diasVencido } from "@/lib/erp/decisiones/cobranza";
import { centavosATexto, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CUENTA } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { hoyInput } from "../../_erp/comunes";
import { marcarIncobrable, registrarCobro, registrarGestion } from "../acciones";

export default async function DetalleCxC({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const c = await db.cuentaPorCobrar.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: { cliente: true, pedido: { select: { id: true, numero: true } }, cobros: { orderBy: { fecha: "desc" } }, gestiones: { orderBy: { creadoEn: "desc" } } },
  });
  if (!c) notFound();
  const hoy = new Date();
  const dias = diasVencido(c.fechaVencimiento, hoy);
  const abierta = ["PENDIENTE", "PARCIAL"].includes(c.estado);
  const ultima = c.gestiones[0];
  const promesaIncumplida = !!(ultima?.tipo === "PROMESA_PAGO" && ultima.fechaPromesa && ultima.fechaPromesa < hoy);
  const puede = puedeOperar(ctx.rol, ctx.areas, "COBRANZA");

  return (
    <>
      <EncabezadoPagina
        titulo={`Cuenta por cobrar ${c.folio}`}
        descripcion={c.cliente.razonSocial}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Cobranza", href: "/cobranza" }, { etiqueta: c.folio }]}
        acciones={<Insignia tono={TONO_CUENTA[c.estado]}>{c.estado.toLowerCase()}</Insignia>}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Resumen">
          <Datos
            filas={[
              ["Cliente", <Link key="c" href={`/ventas/clientes/${c.clienteId}`} className="text-primario hover:underline">{c.cliente.razonSocial}</Link>],
              ["Pedido", c.pedido ? <Link key="p" href={`/ventas/pedidos/${c.pedido.id}`} className="text-primario hover:underline">#{c.pedido.numero}</Link> : "—"],
              ["Emisión / vencimiento", `${formatoFecha(c.fechaEmision)} / ${formatoFecha(c.fechaVencimiento)}`],
              ["Total / saldo", `${formatoPesos(c.total)} / ${formatoPesos(c.saldo)}`],
              ["Días vencida", dias > 0 ? String(dias) : "Al corriente"],
              ["Siguiente acción sugerida", abierta ? accionSugerida(dias, promesaIncumplida) : "—"],
            ]}
          />
          {promesaIncumplida && abierta && (
            <div className="mt-3">
              <Aviso tono="peligro">El cliente incumplió su promesa de pago del {formatoFecha(ultima!.fechaPromesa)}.</Aviso>
            </div>
          )}
        </Tarjeta>

        {abierta && puede && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Tarjeta titulo="Registrar cobro" descripcion="Se registra también como ingreso en tesorería.">
              <FormaAccion accion={registrarCobro.bind(null, c.id)} textoBoton="Registrar cobro" reiniciar>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Fecha" htmlFor="fecha" requerido>
                    <Entrada id="fecha" name="fecha" type="date" defaultValue={hoyInput()} required />
                  </Campo>
                  <Campo etiqueta="Monto" htmlFor="monto" requerido>
                    <Entrada id="monto" name="monto" inputMode="decimal" defaultValue={centavosATexto(c.saldo)} required />
                  </Campo>
                  <Campo etiqueta="Método" htmlFor="metodo" requerido>
                    <Selector id="metodo" name="metodo">
                      {METODOS_PAGO.map((m) => (
                        <option key={m} value={m}>
                          {m.toLowerCase()}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Referencia" htmlFor="referencia">
                    <Entrada id="referencia" name="referencia" />
                  </Campo>
                </div>
              </FormaAccion>
            </Tarjeta>
            <Tarjeta titulo="Registrar gestión" descripcion="«Suspensión de crédito» bloquea nuevos pedidos a crédito del cliente.">
              <FormaAccion accion={registrarGestion.bind(null, c.id)} textoBoton="Registrar gestión" reiniciar>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Tipo" htmlFor="tipo" requerido>
                    <Selector id="tipo" name="tipo">
                      {TIPOS_GESTION.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA_GESTION[t]}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Fecha prometida" htmlFor="fechaPromesa">
                    <Entrada id="fechaPromesa" name="fechaPromesa" type="date" />
                  </Campo>
                  <Campo etiqueta="Nota" htmlFor="nota" requerido className="col-span-2">
                    <Entrada id="nota" name="nota" required />
                  </Campo>
                </div>
              </FormaAccion>
            </Tarjeta>
          </div>
        )}

        <Tarjeta titulo="Cobros">
          {c.cobros.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin cobros.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Método</Th>
                  <Th>Referencia</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {c.cobros.map((x) => (
                  <tr key={x.id}>
                    <Td>{formatoFecha(x.fecha)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(x.monto)}</Td>
                    <Td>{x.metodo.toLowerCase()}</Td>
                    <Td>{x.referencia ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Gestiones de cobranza">
          {c.gestiones.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin gestiones.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {c.gestiones.map((g) => (
                <li key={g.id} className="rounded-md border border-borde px-3 py-2">
                  <span className="font-medium">{ETIQUETA_GESTION[g.tipo as TipoGestion] ?? g.tipo}</span> · {formatoFecha(g.creadoEn)}
                  {g.fechaPromesa && <span className="text-texto-suave"> · promete pagar el {formatoFecha(g.fechaPromesa)}</span>}
                  <p className="text-texto-suave">{g.nota}</p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        {abierta && ctx.rol === "ADMIN" && dias > 90 && (
          <Tarjeta titulo="Castigo de cartera" descripcion="Decisión de dirección para saldos con más de 90 días.">
            <FormaAccion accion={marcarIncobrable.bind(null, c.id)} textoBoton="Marcar como incobrable" variante="peligro" confirmar="¿Castigar el saldo como incobrable?" />
          </Tarjeta>
        )}
      </div>
    </>
  );
}
