"use client";

import { useState } from "react";

import { cx } from "./index";

/** Botón para copiar un valor al portapapeles (usado en la hoja de captura). */
export function BotonCopiar({ valor, etiqueta = "Copiar", className }: { valor: string; etiqueta?: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={cx(
        "no-imprimir rounded border border-borde px-2 py-0.5 text-xs text-texto-suave hover:border-primario hover:text-primario",
        className,
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          setCopiado(false);
        }
      }}
      aria-label={`${etiqueta}: ${valor}`}
    >
      {copiado ? "¡Copiado!" : etiqueta}
    </button>
  );
}
