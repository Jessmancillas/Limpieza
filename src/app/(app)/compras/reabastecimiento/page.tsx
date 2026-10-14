import Link from "next/link";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Campo, EncabezadoPagina, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { POLITICA_ABC } from "@/lib/erp/decisiones/inventario";
import { formatoNumero, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CLASE } from "@/lib/erp/presentacion";
import { analizarInventario } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasCompras } from "../../_erp/comunes";
import { generarOCSugeridas } from "../acciones";

export default async function Reabastecimiento() {
  const ctx = await obtenerContextoErp();
  const [analisis, proveedores, almacenes] = await Promise.all([
    analizarInventario(ctx.empresa.id, ctx.config.factorServicioZ),
    db.proveedor.findMany({ where: { empresaId: ctx.empresa.id }, select: { id: true, razonSocial: true, estado: true } }),
    db.almacen.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { clave: "asc" } }),
  ]);
  const sugerencias = analisis.filter((a) => a.sugerida > 0).sort((a, b) => a.clase.localeCompare(b.clase));
  const proveedor = new Map(proveedores.map((p) => [p.id, p]));
  const puede = puedeOperar(ctx.rol, ctx.areas, "COMPRAS");
  const z = ctx.config.factorServicioZ / 100;

  return (
    <>
      <EncabezadoPagina
        titulo="Reabastecimiento"
        descripcion="Modelo de decisión de compras: lote económico (EOQ), stock de seguridad y punto de reorden por artículo, priorizado por clasificación ABC."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Compras" }, { etiqueta: "Reabastecimiento" }]}
      />
      <PestanasCompras actual="/compras/reabastecimiento" />

      <Tarjeta titulo="Cómo decide el modelo" className="mb-6">
        <ul className="list-inside list-disc space-y-1 text-sm text-texto-suave">
          <li>
            <strong>EOQ</strong> = √(2·D·S / H): D demanda anual, S costo de ordenar, H costo anual de mantener una unidad (costo × % de mantener).
          </li>
          <li>
            <strong>Stock de seguridad</strong> = z · σ<sub>diaria</sub> · √L con z = {z} (nivel de servicio configurado en Políticas).
          </li>
          <li>
            <strong>Punto de reorden</strong> = demanda diaria · L + stock de seguridad (nunca menor que el stock mínimo). Se pide cuando existencia + en tránsito ≤ ROP.
          </li>
          <li>Si el artículo no tiene demanda anual capturada se estima con las salidas por venta de los últimos 365 días.</li>
        </ul>
      </Tarjeta>

      {sugerencias.length === 0 ? (
        <EstadoVacio titulo="Sin compras sugeridas" descripcion="Todos los artículos están por encima de su punto de reorden." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>ABC</Th>
                <Th>Artículo</Th>
                <Th className="text-right">Existencia</Th>
                <Th className="text-right">En tránsito</Th>
                <Th className="text-right">ROP</Th>
                <Th className="text-right">EOQ</Th>
                <Th className="text-right">Sugerido</Th>
                <Th className="text-right">Importe aprox.</Th>
                <Th>Proveedor preferente</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {sugerencias.map((a) => {
                const p = a.proveedorPreferenteId ? proveedor.get(a.proveedorPreferenteId) : null;
                return (
                  <tr key={a.id}>
                    <Td>
                      <span title={POLITICA_ABC[a.clase]}>
                        <Insignia tono={TONO_CLASE[a.clase]}>{a.clase}</Insignia>
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/almacen/articulos/${a.id}`} className="text-primario hover:underline">
                        <span className="font-mono text-xs">{a.sku}</span> {a.nombre}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{formatoNumero(a.existencia)}</Td>
                    <Td className="text-right tabular-nums">{formatoNumero(a.enTransito)}</Td>
                    <Td className="text-right tabular-nums">{formatoNumero(Math.ceil(a.politica.puntoReorden))}</Td>
                    <Td className="text-right tabular-nums">{a.politica.eoq ? formatoNumero(Math.ceil(a.politica.eoq)) : "—"}</Td>
                    <Td className="text-right font-semibold tabular-nums">{formatoNumero(a.sugerida)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(Math.round(a.sugerida * a.costoUnitario))}</Td>
                    <Td>
                      {p ? (
                        <>
                          {p.razonSocial}
                          {p.estado === "BLOQUEADO" && (
                            <span className="ml-1">
                              <Insignia tono="peligro">Bloqueado</Insignia>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-texto-suave">Sin proveedor preferente</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
          {puede && almacenes.length > 0 && (
            <Tarjeta titulo="Generar órdenes de compra sugeridas" descripcion="Crea una OC en borrador por proveedor preferente; después pasan por la autorización normal." className="mt-6">
              <FormaAccion accion={generarOCSugeridas} textoBoton="Generar OC en borrador" className="flex flex-wrap items-end gap-3 space-y-0">
                <Campo etiqueta="Almacén destino" htmlFor="almacenId">
                  <Selector id="almacenId" name="almacenId" className="w-64">
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.clave} · {a.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </FormaAccion>
            </Tarjeta>
          )}
        </>
      )}
    </>
  );
}
