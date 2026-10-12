import type { ComponentProps } from "react";

import { Selector } from "@/components/ui";
import type { OpcionCatalogo } from "@/lib/catalogos";

/**
 * <select> con las opciones de un catálogo VUCEM. Las opciones se cargan en el servidor
 * con obtenerOpcionesCatalogo() y se pasan como prop (funciona en componentes cliente y servidor).
 * Si el valor actual no existe en el catálogo, se muestra igualmente para no perderlo.
 */
export function SelectorCatalogo({
  opciones,
  valor,
  placeholder = "Selecciona…",
  filtroPadre,
  ...props
}: Omit<ComponentProps<"select">, "children" | "defaultValue"> & {
  opciones: OpcionCatalogo[];
  valor?: string | null;
  placeholder?: string;
  /** Si se indica, solo muestra opciones cuyo padreClave coincide. */
  filtroPadre?: string | null;
}) {
  const visibles = filtroPadre === undefined ? opciones : opciones.filter((o) => o.padreClave === filtroPadre);
  const valorHuerfano = valor && !visibles.some((o) => o.clave === valor) ? valor : null;
  return (
    <Selector defaultValue={valor ?? ""} {...props}>
      <option value="">{placeholder}</option>
      {valorHuerfano && <option value={valorHuerfano}>{valorHuerfano} (no está en el catálogo)</option>}
      {visibles.map((o) => (
        <option key={o.clave} value={o.clave}>
          {o.descripcion} ({o.clave}){o.porConfirmar ? " ⚠" : ""}
        </option>
      ))}
    </Selector>
  );
}
