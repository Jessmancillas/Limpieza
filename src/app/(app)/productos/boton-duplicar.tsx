"use client";

import { useActionState } from "react";

import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import type { AccionFormulario } from "../establecimientos/_compartido/use-formulario";

/** Crea una copia del producto y abre la copia para editarla. */
export function BotonDuplicar({ accion }: { accion: AccionFormulario }) {
  const [estado, despachar] = useActionState(accion, ESTADO_INICIAL);
  return (
    <form action={despachar} className="space-y-2">
      <MensajeFormulario estado={estado} />
      <BotonEnviar variante="secundario" tamano="sm" textoEnviando="Duplicando…">
        Duplicar producto
      </BotonEnviar>
      <p className="text-xs text-texto-suave">Útil para variantes del mismo dispositivo (otra presentación o modelo).</p>
    </form>
  );
}
