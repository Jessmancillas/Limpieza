import Link from "next/link";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Campo, EncabezadoPagina, Entrada, EstadoVacio, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_MOVIMIENTO, type TipoMovimiento } from "@/lib/erp/constantes";
import { formatoNumero, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasAlmacen } from "../../_erp/comunes";
import { registrarAjuste } from "../acciones";

export default async function Movimientos() {
  const ctx = await obtenerContextoErp();
  const [movimientos, articulos, almacenes] = await Promise.all([
    db.movimientoInventario.findMany({
      where: { empresaId: ctx.empresa.id },
      include: { articulo: { select: { sku: true, nombre: true } }, almacen: { select: { clave: true } } },
      orderBy: { creadoEn: "desc" },
      take: 100,
    }),
    db.articulo.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { sku: "asc" }, select: { id: true, sku: true, nombre: true } }),
    db.almacen.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { clave: "asc" } }),
  ]);
  const puede = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");

  return (
    <>
      <EncabezadoPagina
        titulo="Kárdex y ajustes"
        descripcion="Cada entrada y salida queda registrada de forma inmutable; las correcciones se hacen con ajustes justificados (control interno, COBIT MEA02)."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Almacén" }, { etiqueta: "Kárdex y ajustes" }]}
      />
      <PestanasAlmacen actual="/almacen/movimientos" />
      {puede && articulos.length > 0 && almacenes.length > 0 && (
        <Tarjeta titulo="Registrar ajuste / inventario inicial" className="mb-6">
          <FormaAccion accion={registrarAjuste} textoBoton="Registrar" reiniciar>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo etiqueta="Artículo" htmlFor="articuloId" requerido>
                <Selector id="articuloId" name="articuloId" required defaultValue="">
                  <option value="" disabled>
                    Elige…
                  </option>
                  {articulos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.sku} · {a.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Almacén" htmlFor="almacenId" requerido>
                <Selector id="almacenId" name="almacenId" required>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.clave} · {a.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Tipo" htmlFor="tipo" requerido>
                <Selector id="tipo" name="tipo" required>
                  <option value="INVENTARIO_INICIAL">Inventario inicial</option>
                  <option value="AJUSTE_ENTRADA">Ajuste de entrada (sobrante)</option>
                  <option value="AJUSTE_SALIDA">Ajuste de salida (merma / faltante)</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Cantidad" htmlFor="cantidad" requerido>
                <Entrada id="cantidad" name="cantidad" inputMode="decimal" required />
              </Campo>
              <Campo etiqueta="Costo unitario (entradas)" htmlFor="costoUnitario" ayuda="Vacío = último costo">
                <Entrada id="costoUnitario" name="costoUnitario" inputMode="decimal" />
              </Campo>
              <Campo etiqueta="Motivo" htmlFor="motivo" requerido>
                <Entrada id="motivo" name="motivo" required maxLength={300} placeholder="Conteo físico del…" />
              </Campo>
            </div>
          </FormaAccion>
        </Tarjeta>
      )}
      {movimientos.length === 0 ? (
        <EstadoVacio titulo="Sin movimientos" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Artículo</Th>
              <Th>Almacén</Th>
              <Th>Tipo</Th>
              <Th className="text-right">Cantidad</Th>
              <Th className="text-right">Costo</Th>
              <Th className="text-right">Saldo</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {movimientos.map((m) => (
              <tr key={m.id}>
                <Td>{formatoFecha(m.creadoEn)}</Td>
                <Td>
                  <Link href={`/almacen/articulos/${m.articuloId}`} className="text-primario hover:underline">
                    <span className="font-mono text-xs">{m.articulo.sku}</span> {m.articulo.nombre}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">{m.almacen.clave}</Td>
                <Td>{ETIQUETA_MOVIMIENTO[m.tipo as TipoMovimiento] ?? m.tipo}</Td>
                <Td className={`text-right tabular-nums ${m.cantidad < 0 ? "text-peligro" : "text-exito"}`}>{formatoNumero(m.cantidad)}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(m.costoUnitario)}</Td>
                <Td className="text-right tabular-nums">{formatoNumero(m.saldoCantidad)}</Td>
                <Td className="text-xs">{m.motivo ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
