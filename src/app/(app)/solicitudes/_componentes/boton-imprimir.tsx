"use client";

import { Boton } from "@/components/ui";

export function BotonImprimir() {
  return (
    <Boton variante="secundario" onClick={() => window.print()} className="no-imprimir">
      Imprimir
    </Boton>
  );
}
