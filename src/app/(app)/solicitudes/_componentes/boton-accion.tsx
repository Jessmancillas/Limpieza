"use client";

import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";

import { useAccion, type AccionFormulario } from "./usar-accion";

/** Formulario de un solo botón (quitar, desligar, duplicar…) con confirmación opcional. */
export function BotonAccion({
  accion,
  children,
  confirmar,
  textoEnviando = "Procesando…",
  variante = "secundario",
  tamano = "sm",
  className,
  mostrarMensaje = true,
}: {
  accion: AccionFormulario;
  children: React.ReactNode;
  /** Texto de confirmación (window.confirm) antes de enviar. */
  confirmar?: string;
  textoEnviando?: string;
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
  tamano?: "sm" | "md";
  className?: string;
  mostrarMensaje?: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje } = useAccion(accion);
  return (
    <form
      action={despachar}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) {
          e.preventDefault();
          return;
        }
        alEnviar(e);
      }}
      className={className}
    >
      <BotonEnviar variante={variante} tamano={tamano} textoEnviando={textoEnviando}>
        {children}
      </BotonEnviar>
      {mostrarMensaje && estado.mensaje && (
        <div ref={refMensaje} className="mt-2">
          <MensajeFormulario estado={estado} />
        </div>
      )}
    </form>
  );
}
