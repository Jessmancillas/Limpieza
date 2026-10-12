"use client";

import { SelectorCatalogo } from "@/components/formularios/selector-catalogo";
import { Entrada } from "@/components/ui";
import type { OpcionCatalogo } from "@/lib/catalogos";

/**
 * Selector de un catálogo VUCEM. Si el catálogo (o el filtro por clave padre) no tiene opciones
 * cargadas, muestra un campo de texto para escribir la clave y no bloquear la captura.
 */
export function CampoCatalogo({
  id,
  name,
  opciones,
  valor,
  filtroPadre,
  nombreCatalogo,
  maxLength,
  required,
  disabled,
  placeholder,
  invalido,
  onCambio,
}: {
  id: string;
  name: string;
  opciones: OpcionCatalogo[];
  valor?: string | null;
  filtroPadre?: string | null;
  nombreCatalogo: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  invalido?: boolean;
  onCambio?: (valor: string) => void;
}) {
  const visibles = filtroPadre === undefined ? opciones : opciones.filter((o) => o.padreClave === filtroPadre);
  if (visibles.length === 0) {
    return (
      <>
        <Entrada
          id={id}
          name={name}
          defaultValue={valor ?? ""}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          autoComplete="off"
          placeholder="Clave"
          aria-invalid={invalido || undefined}
          aria-describedby={`${id}-sin-catalogo`}
          onChange={(e) => onCambio?.(e.target.value)}
        />
        <p id={`${id}-sin-catalogo`} className="text-xs text-aviso">
          El catálogo «{nombreCatalogo}» no tiene opciones cargadas: escribe la clave tal como aparece en VUCEM o cárgalo en
          Catálogos VUCEM.
        </p>
      </>
    );
  }
  return (
    <SelectorCatalogo
      id={id}
      name={name}
      opciones={visibles}
      valor={valor}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={invalido || undefined}
      onChange={(e) => onCambio?.(e.target.value)}
    />
  );
}
