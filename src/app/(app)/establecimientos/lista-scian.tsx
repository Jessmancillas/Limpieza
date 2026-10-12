"use client";

import { useMemo, useRef, useState } from "react";

import { Boton, Campo, Entrada } from "@/components/ui";
import type { OpcionCatalogo } from "@/lib/catalogos";

type FilaScian = { id: number; clave: string; descripcion: string };

/**
 * Lista dinámica de claves SCIAN (1..N). Se envían como campos repetidos scianClave /
 * scianDescripcion. La clave se puede escribir o elegir del catálogo CAT_SCIAN (datalist).
 */
export function ListaScian({
  inicial,
  opciones,
  errores = {},
}: {
  inicial: Array<{ clave: string; descripcion: string | null }>;
  opciones: OpcionCatalogo[];
  errores?: Record<string, string[]>;
}) {
  const [filas, setFilas] = useState<FilaScian[]>(() =>
    (inicial.length > 0 ? inicial : [{ clave: "", descripcion: "" }]).map((f, i) => ({
      id: i,
      clave: f.clave,
      descripcion: f.descripcion ?? "",
    })),
  );
  const siguienteId = useRef(filas.length);
  const catalogo = useMemo(() => new Map(opciones.map((o) => [o.clave, o.descripcion])), [opciones]);

  const cambiarClave = (id: number, clave: string) =>
    setFilas((actual) =>
      actual.map((f) => {
        if (f.id !== id) return f;
        const descripcionCatalogo = catalogo.get(clave.trim());
        // Autocompleta la descripción si estaba vacía o venía del catálogo para la clave anterior.
        const autocompletar = descripcionCatalogo && (f.descripcion === "" || f.descripcion === catalogo.get(f.clave.trim()));
        return { ...f, clave, descripcion: autocompletar ? descripcionCatalogo : f.descripcion };
      }),
    );

  const agregar = () => {
    const id = siguienteId.current++;
    setFilas((actual) => [...actual, { id, clave: "", descripcion: "" }]);
    // Enfoca la nueva clave después de pintarla.
    requestAnimationFrame(() => document.getElementById(`scian-clave-${id}`)?.focus());
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">
        Actividades SCIAN<span className="ml-0.5 text-peligro">*</span>
      </legend>
      <p className="text-xs text-texto-suave">
        Claves de 6 dígitos del Sistema de Clasificación Industrial de América del Norte con las que el establecimiento está
        registrado ante COFEPRIS. Puedes agregar varias.
        {opciones.length === 0 && " El catálogo SCIAN no está cargado: escribe la clave y su descripción."}
      </p>
      {opciones.length > 0 && (
        <datalist id="catalogo-scian">
          {opciones.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.descripcion}
            </option>
          ))}
        </datalist>
      )}
      {errores.scian && (
        <p className="text-xs text-peligro" role="alert">
          {errores.scian.join(" ")}
        </p>
      )}
      <ol className="space-y-3">
        {filas.map((f, i) => (
          <li key={f.id} className="grid grid-cols-1 items-start gap-3 rounded-md border border-borde p-3 sm:grid-cols-[10rem_1fr_auto]">
            <Campo
              etiqueta={`Clave SCIAN ${i + 1}`}
              htmlFor={`scian-clave-${f.id}`}
              requerido
              errores={errores[`scian.${i}.clave`]}
            >
              <Entrada
                id={`scian-clave-${f.id}`}
                name="scianClave"
                value={f.clave}
                onChange={(e) => cambiarClave(f.id, e.target.value)}
                list={opciones.length > 0 ? "catalogo-scian" : undefined}
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                title="6 dígitos"
                required
                autoComplete="off"
                aria-invalid={errores[`scian.${i}.clave`] ? true : undefined}
                className="font-mono"
              />
            </Campo>
            <Campo etiqueta="Descripción" htmlFor={`scian-desc-${f.id}`} errores={errores[`scian.${i}.descripcion`]}>
              <Entrada
                id={`scian-desc-${f.id}`}
                name="scianDescripcion"
                value={f.descripcion}
                onChange={(e) =>
                  setFilas((actual) => actual.map((x) => (x.id === f.id ? { ...x, descripcion: e.target.value } : x)))
                }
                maxLength={500}
              />
            </Campo>
            <div className="sm:pt-6">
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => setFilas((actual) => actual.filter((x) => x.id !== f.id))}
                disabled={filas.length === 1}
                aria-label={`Quitar clave SCIAN ${i + 1}`}
              >
                Quitar
              </Boton>
            </div>
          </li>
        ))}
      </ol>
      <Boton variante="secundario" tamano="sm" onClick={agregar}>
        + Agregar clave SCIAN
      </Boton>
    </fieldset>
  );
}
