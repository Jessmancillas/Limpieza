import { PestanasModulo } from "@/components/erp/indicadores";

// Utilidades de las pantallas del ERP.

export type ParamsBusqueda = Promise<Record<string, string | string[] | undefined>>;

export function textoParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Fecha de hoy (UTC) como yyyy-mm-dd para <input type="date">. */
export function hoyInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PestanasCompras({ actual }: { actual: string }) {
  return (
    <PestanasModulo
      actual={actual}
      pestanas={[
        { href: "/compras/ordenes", etiqueta: "Órdenes de compra" },
        { href: "/compras/proveedores", etiqueta: "Proveedores" },
        { href: "/compras/reabastecimiento", etiqueta: "Reabastecimiento" },
      ]}
    />
  );
}

export function PestanasAlmacen({ actual }: { actual: string }) {
  return (
    <PestanasModulo
      actual={actual}
      pestanas={[
        { href: "/almacen/articulos", etiqueta: "Inventario" },
        { href: "/almacen/movimientos", etiqueta: "Kárdex y ajustes" },
        { href: "/almacen/almacenes", etiqueta: "Almacenes" },
      ]}
    />
  );
}

export function PestanasVentas({ actual }: { actual: string }) {
  return (
    <PestanasModulo
      actual={actual}
      pestanas={[
        { href: "/ventas/pedidos", etiqueta: "Pedidos" },
        { href: "/ventas/clientes", etiqueta: "Clientes" },
        { href: "/cobranza", etiqueta: "Cobranza" },
      ]}
    />
  );
}

export function PestanasGobierno({ actual }: { actual: string }) {
  return (
    <PestanasModulo
      actual={actual}
      pestanas={[
        { href: "/gobierno", etiqueta: "Resumen y segregación" },
        { href: "/gobierno/controles?marco=COBIT", etiqueta: "COBIT 2019" },
        { href: "/gobierno/controles?marco=ISO27001", etiqueta: "ISO/IEC 27001 (SoA)" },
        { href: "/gobierno/riesgos", etiqueta: "Riesgos" },
        { href: "/gobierno/servicios", etiqueta: "Mesa de servicio ITIL" },
        { href: "/gobierno/politicas", etiqueta: "Políticas de decisión" },
      ]}
    />
  );
}
