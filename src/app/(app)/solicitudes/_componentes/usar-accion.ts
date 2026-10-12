"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

export type AccionFormulario = (previo: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/**
 * useActionState para las tarjetas de la solicitud. Con JavaScript el envío no reinicia el
 * formulario (se conserva lo capturado si hay errores); con `reiniciar` se limpia al guardar bien
 * (formularios de alta como "agregar mercancía"). Sin JavaScript el `action` sigue funcionando.
 */
export function useAccion(accion: AccionFormulario, { reiniciar = false }: { reiniciar?: boolean } = {}) {
  const [estado, despachar, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const refForm = useRef<HTMLFormElement>(null);
  const refMensaje = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (estado === ESTADO_INICIAL) return;
    if (estado.ok && reiniciar) refForm.current?.reset();
    if (estado.mensaje && !estado.ok) refMensaje.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [estado, reiniciar]);

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const datos = new FormData(e.currentTarget, submitter);
    startTransition(() => despachar(datos));
  };

  const errores = estado.errores ?? {};
  /** Errores de un campo (para <Campo errores>). */
  const err = (campo: string) => errores[campo];
  /** aria-invalid del control. */
  const inv = (campo: string) => (errores[campo] ? true : undefined);

  return { estado, despachar, alEnviar, pendiente, refForm, refMensaje, err, inv };
}
