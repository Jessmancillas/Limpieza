"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

export type ElementoNav = { href: string; etiqueta: string; grupo?: string };

export function Navegacion({ elementos }: { elementos: ElementoNav[] }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="space-y-0.5">
      {elementos.map((e, i) => {
        const activo = e.href === "/" ? ruta === "/" : ruta === e.href || ruta.startsWith(`${e.href}/`);
        const mostrarGrupo = e.grupo && e.grupo !== elementos[i - 1]?.grupo;
        return (
          <div key={e.href}>
            {mostrarGrupo && (
              <p className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-texto-suave">{e.grupo}</p>
            )}
            <Link
              href={e.href}
              aria-current={activo ? "page" : undefined}
              className={cx(
                "block rounded-md px-3 py-1.5 text-sm",
                activo ? "bg-primario-suave font-medium text-primario" : "text-texto hover:bg-fondo",
              )}
            >
              {e.etiqueta}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
