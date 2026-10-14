import Link from "next/link";
import type { ReactNode } from "react";

import { cx, Insignia } from "@/components/ui";
import type { Semaforo } from "@/lib/erp/decisiones/gobierno";

const COLOR: Record<Semaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-aviso",
  rojo: "bg-peligro",
  gris: "bg-borde",
};
const TEXTO: Record<Semaforo, string> = { verde: "En meta", amarillo: "Cerca de la meta", rojo: "Fuera de meta", gris: "Sin datos" };

/** Tarjeta de indicador (KPI) con semáforo opcional. */
export function Kpi({
  titulo,
  valor,
  detalle,
  semaforo,
  marco,
}: {
  titulo: ReactNode;
  valor: ReactNode;
  detalle?: ReactNode;
  semaforo?: Semaforo;
  /** Referencia al marco (p. ej. "COBIT MEA01") */
  marco?: string;
}) {
  return (
    <div className="rounded-lg border border-borde bg-superficie p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">{titulo}</p>
        {semaforo && (
          <span className="flex items-center gap-1 text-[11px] text-texto-suave" title={TEXTO[semaforo]}>
            <span className={cx("inline-block size-2.5 rounded-full", COLOR[semaforo])} aria-hidden />
            <span className="sr-only">{TEXTO[semaforo]}</span>
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-texto-suave">{detalle}</p>}
      {marco && <p className="mt-2 text-[10px] uppercase tracking-wider text-texto-suave/80">{marco}</p>}
    </div>
  );
}

export function RejillaKpi({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

type Tono = "neutro" | "primario" | "exito" | "aviso" | "peligro" | "info";

/** Insignia de estado con tono por mapa. */
export function InsigniaEstado({ estado, etiquetas, tonos }: { estado: string; etiquetas: Record<string, string>; tonos: Record<string, Tono> }) {
  return <Insignia tono={tonos[estado] ?? "neutro"}>{etiquetas[estado] ?? estado}</Insignia>;
}

/** Pestañas de navegación de un módulo. */
export function PestanasModulo({ actual, pestanas }: { actual: string; pestanas: Array<{ href: string; etiqueta: string }> }) {
  return (
    <nav aria-label="Secciones del módulo" className="mb-5 flex flex-wrap gap-1 border-b border-borde">
      {pestanas.map((p) => {
        const activa = p.href === actual;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              activa ? "border-primario font-medium text-primario" : "border-transparent text-texto-suave hover:text-texto",
            )}
          >
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
