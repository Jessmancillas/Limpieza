"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { clasesBoton, cx } from "./index";

/** Botón de envío que se deshabilita mientras la server action está en curso. */
export function BotonEnviar({
  children,
  textoEnviando = "Guardando…",
  variante = "primario",
  tamano = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  textoEnviando?: string;
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
  tamano?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cx(clasesBoton(variante, tamano), className)}
      {...props}
    >
      {pending ? textoEnviando : children}
    </button>
  );
}
