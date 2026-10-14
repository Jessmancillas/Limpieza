import { Campo, Entrada, Selector } from "@/components/ui";
import { centavosATexto } from "@/lib/erp/dinero";

export type ValoresArticulo = {
  sku?: string;
  nombre?: string;
  categoria?: string | null;
  unidad?: string;
  precioVenta?: number;
  tasaIvaBp?: number;
  stockMinimo?: number;
  stockMaximo?: number;
  demandaAnual?: number;
  desviacionDemandaDiaria?: number;
  costoOrdenar?: number;
  costoMantenerBp?: number;
  tiempoEntregaDias?: number;
  proveedorPreferenteId?: string | null;
};

export function CamposArticulo({ v = {}, proveedores }: { v?: ValoresArticulo; proveedores: Array<{ id: string; clave: string; razonSocial: string }> }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="SKU" htmlFor="sku" requerido>
          <Entrada id="sku" name="sku" defaultValue={v.sku} required maxLength={30} />
        </Campo>
        <Campo etiqueta="Nombre" htmlFor="nombre" requerido className="sm:col-span-2">
          <Entrada id="nombre" name="nombre" defaultValue={v.nombre} required maxLength={200} />
        </Campo>
        <Campo etiqueta="Categoría" htmlFor="categoria">
          <Entrada id="categoria" name="categoria" defaultValue={v.categoria ?? ""} />
        </Campo>
        <Campo etiqueta="Unidad" htmlFor="unidad" requerido>
          <Entrada id="unidad" name="unidad" defaultValue={v.unidad ?? "PZA"} required maxLength={20} />
        </Campo>
        <Campo etiqueta="Proveedor preferente" htmlFor="proveedorPreferenteId">
          <Selector id="proveedorPreferenteId" name="proveedorPreferenteId" defaultValue={v.proveedorPreferenteId ?? ""}>
            <option value="">Sin proveedor preferente</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clave} · {p.razonSocial}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Precio de venta (sin IVA)" htmlFor="precioVenta" requerido>
          <Entrada id="precioVenta" name="precioVenta" inputMode="decimal" defaultValue={centavosATexto(v.precioVenta ?? 0)} required />
        </Campo>
        <Campo etiqueta="IVA %" htmlFor="tasaIva" requerido>
          <Entrada id="tasaIva" name="tasaIva" inputMode="decimal" defaultValue={String((v.tasaIvaBp ?? 1600) / 100)} required />
        </Campo>
      </div>
      <fieldset className="rounded-md border border-borde p-4">
        <legend className="px-1 text-sm font-medium">Parámetros del modelo de inventario (EOQ / punto de reorden)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Campo etiqueta="Stock mínimo" htmlFor="stockMinimo">
            <Entrada id="stockMinimo" name="stockMinimo" inputMode="decimal" defaultValue={String(v.stockMinimo ?? 0)} />
          </Campo>
          <Campo etiqueta="Stock máximo" htmlFor="stockMaximo" ayuda="0 = sin máximo">
            <Entrada id="stockMaximo" name="stockMaximo" inputMode="decimal" defaultValue={String(v.stockMaximo ?? 0)} />
          </Campo>
          <Campo etiqueta="Demanda anual" htmlFor="demandaAnual" ayuda="0 = estimar con ventas">
            <Entrada id="demandaAnual" name="demandaAnual" inputMode="decimal" defaultValue={String(v.demandaAnual ?? 0)} />
          </Campo>
          <Campo etiqueta="Desv. demanda diaria (σ)" htmlFor="desviacionDemandaDiaria">
            <Entrada id="desviacionDemandaDiaria" name="desviacionDemandaDiaria" inputMode="decimal" defaultValue={String(v.desviacionDemandaDiaria ?? 0)} />
          </Campo>
          <Campo etiqueta="Costo de ordenar (por pedido)" htmlFor="costoOrdenar">
            <Entrada id="costoOrdenar" name="costoOrdenar" inputMode="decimal" defaultValue={centavosATexto(v.costoOrdenar ?? 50000)} />
          </Campo>
          <Campo etiqueta="Costo de mantener % anual" htmlFor="costoMantener">
            <Entrada id="costoMantener" name="costoMantener" inputMode="decimal" defaultValue={String((v.costoMantenerBp ?? 2500) / 100)} />
          </Campo>
          <Campo etiqueta="Tiempo de entrega (días)" htmlFor="tiempoEntregaDias">
            <Entrada id="tiempoEntregaDias" name="tiempoEntregaDias" type="number" min={0} max={365} defaultValue={v.tiempoEntregaDias ?? 7} />
          </Campo>
        </div>
      </fieldset>
    </div>
  );
}
