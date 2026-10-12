"use client";

import { useActionState } from "react";

import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import type { AccionFormulario } from "./use-formulario";

/**
 * Botones para activar/desactivar y eliminar un registro de catálogo. Si el registro ya se usó en
 * solicitudes no se puede borrar: el servidor lo desactiva en su lugar.
 */
export function AccionesRegistro({
  activo,
  usos,
  nota,
  accionActivo,
  accionEliminar,
  nombre,
}: {
  activo: boolean;
  /** Número de solicitudes donde se usa. */
  usos: number;
  /** Aclaración adicional (p. ej. qué pasa con los productos ligados al eliminar). */
  nota?: string;
  accionActivo: AccionFormulario;
  accionEliminar: AccionFormulario;
  nombre: string;
}) {
  const [estadoActivo, despacharActivo] = useActionState(accionActivo, ESTADO_INICIAL);
  const [estadoEliminar, despacharEliminar] = useActionState(accionEliminar, ESTADO_INICIAL);
  const estado = estadoEliminar.mensaje ? estadoEliminar : estadoActivo;

  return (
    <div className="space-y-3">
      <MensajeFormulario estado={estado} />
      <div className="flex flex-wrap gap-2">
        <form action={despacharActivo}>
          <BotonEnviar variante="secundario" tamano="sm" textoEnviando="Guardando…">
            {activo ? "Desactivar" : "Reactivar"}
          </BotonEnviar>
        </form>
        {usos === 0 && (
          <form
            action={despacharEliminar}
            onSubmit={(e) => {
              if (!window.confirm(`¿Eliminar «${nombre}»? Esta acción no se puede deshacer.`)) e.preventDefault();
            }}
          >
            <BotonEnviar variante="peligro" tamano="sm" textoEnviando="Eliminando…">
              Eliminar
            </BotonEnviar>
          </form>
        )}
      </div>
      <p className="text-xs text-texto-suave">
        {usos > 0 && `Se usa en ${usos} solicitud${usos === 1 ? "" : "es"}: no se puede eliminar, solo desactivar. `}
        Los registros inactivos no se ofrecen al capturar solicitudes nuevas.
        {nota && ` ${nota}`}
      </p>
    </div>
  );
}
