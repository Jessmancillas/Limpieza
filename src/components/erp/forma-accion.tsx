"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";

import { cx, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

export type AccionErp = (previo: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/**
 * Formulario genérico del ERP para server actions. Los campos llegan como `children` (pueden ser
 * componentes de servidor); los errores por campo se listan bajo el mensaje. Con `reiniciar` se
 * limpia al guardar bien (altas de partidas). Funciona sin JavaScript gracias a `action`.
 */
export function FormaAccion({
  accion,
  children,
  textoBoton = "Guardar",
  textoEnviando = "Guardando…",
  variante = "primario",
  tamano = "md",
  confirmar,
  reiniciar = false,
  className,
  claseBotones,
  extraBotones,
}: {
  accion: AccionErp;
  children?: ReactNode;
  textoBoton?: ReactNode;
  textoEnviando?: string;
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
  tamano?: "sm" | "md";
  /** Texto de confirmación antes de enviar. */
  confirmar?: string;
  reiniciar?: boolean;
  className?: string;
  claseBotones?: string;
  extraBotones?: ReactNode;
}) {
  const [estado, despachar] = useActionState(accion, ESTADO_INICIAL);
  const refForm = useRef<HTMLFormElement>(null);
  const refMensaje = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (estado === ESTADO_INICIAL) return;
    if (estado.ok && reiniciar) refForm.current?.reset();
    if (estado.mensaje) refMensaje.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [estado, reiniciar]);

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmar && !window.confirm(confirmar)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const datos = new FormData(e.currentTarget, submitter);
    startTransition(() => despachar(datos));
  };

  const errores = Object.entries(estado.errores ?? {});
  return (
    <form ref={refForm} action={despachar} onSubmit={alEnviar} className={cx("space-y-3", className)}>
      {children}
      <div className={cx("flex flex-wrap items-center gap-2", claseBotones)}>
        <BotonEnviar variante={variante} tamano={tamano} textoEnviando={textoEnviando}>
          {textoBoton}
        </BotonEnviar>
        {extraBotones}
      </div>
      {(estado.mensaje || errores.length > 0) && (
        <div ref={refMensaje} className="space-y-1">
          <MensajeFormulario estado={estado} />
          {errores.length > 0 && (
            <ul className="list-inside list-disc text-xs text-peligro" role="alert">
              {errores.map(([campo, mensajes]) => (
                <li key={campo}>
                  <span className="font-medium">{campo}:</span> {mensajes.join(" ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
