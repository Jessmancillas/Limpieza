"use client";

import { useActionState } from "react";

import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { descartarEDocumentDeOtroAmbiente } from "./acciones";

/** Descarta un eDocument generado en otro ambiente (p. ej. en el SIMULADOR). */
export function BotonDescartarEDocument({ solicitudId, documentoId, ambiente }: { solicitudId: string; documentoId: string; ambiente: string }) {
  const [estado, accion] = useActionState(descartarEDocumentDeOtroAmbiente, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-1">
      <input type="hidden" name="solicitudId" value={solicitudId} />
      <input type="hidden" name="documentoId" value={documentoId} />
      <BotonEnviar tamano="sm" variante="secundario" textoEnviando="Descartando…">
        Descartar eDocument de {ambiente}
      </BotonEnviar>
      {estado.mensaje && (
        <p className={`text-xs ${estado.ok ? "text-exito" : "text-peligro"}`} role={estado.ok ? "status" : "alert"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
