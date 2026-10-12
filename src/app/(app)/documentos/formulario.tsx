"use client";

import { useState } from "react";

import { Boton, Campo, EnlaceBoton, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { ETIQUETA_TIPO_DOCUMENTO, TIPOS_DOCUMENTO, type TipoDocumento } from "@/lib/constantes";
import { ACCEPT_SUBIDA, EXTENSIONES_ACEPTADAS, formatoBytes, MAX_BYTES_SUBIDA, MAX_MB_SUBIDA, MAX_NOMBRE_DOCUMENTO } from "@/lib/pdf/limites";
import { normalizarNombreDocumento } from "@/lib/pdf/nombre-documento";

import { CampoCatalogo } from "../establecimientos/_compartido/campo-catalogo";
import { useFormularioAccion, type AccionFormulario } from "../establecimientos/_compartido/use-formulario";
import type { OpcionesDocumento } from "./_lib/esquema";

export type ValoresDocumento = {
  tipo: TipoDocumento | "";
  nombre: string;
  idTipoDocumentoVucem: string | null;
  productoId: string | null;
  establecimientoId: string | null;
  /** yyyy-mm-dd */
  vigenciaHasta: string;
};

/** Nombre sugerido para un tipo de documento (es el "nombreDocumento" que se manda a VUCEM). */
function nombreSugerido(tipo: string): string {
  const etiqueta = ETIQUETA_TIPO_DOCUMENTO[tipo as TipoDocumento];
  return etiqueta ? normalizarNombreDocumento(etiqueta) : "";
}

/** Revisión del archivo en el navegador (el servidor vuelve a validar tipo y tamaño). */
function problemaArchivo(archivo: File | undefined): string | null {
  if (!archivo) return null;
  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES_ACEPTADAS.some((ext) => nombre.endsWith(ext))) return "Sube un PDF o una imagen JPG, PNG o TIFF.";
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > MAX_BYTES_SUBIDA) return `El archivo pesa ${formatoBytes(archivo.size)}; el máximo es ${MAX_MB_SUBIDA} MB.`;
  return null;
}

/** Formulario de alta (con archivo) o edición de los datos de un documento. */
export function FormularioDocumento({
  modo,
  accion,
  inicial,
  opciones,
  limites,
  volver,
  textoBoton,
}: {
  modo: "nuevo" | "editar";
  accion: AccionFormulario;
  inicial: ValoresDocumento;
  opciones: OpcionesDocumento;
  limites: { minDpi: number; maxMB: number };
  /** Ruta interna a la que se regresa al guardar (solo alta). */
  volver?: string | null;
  textoBoton: string;
}) {
  const { estado, despachar, alEnviar, pendiente, refMensaje } = useFormularioAccion(accion);
  const errores = estado.errores ?? {};
  const v = (k: keyof ValoresDocumento) => estado.valores?.[k] ?? inicial[k] ?? "";
  const invalido = (k: string) => (errores[k] ? true : undefined);

  const [tipo, setTipo] = useState<string>(v("tipo"));
  const [nombre, setNombre] = useState<string>(v("nombre") || nombreSugerido(v("tipo")));
  const [productoId, setProductoId] = useState<string>(v("productoId"));
  const [establecimientoId, setEstablecimientoId] = useState<string>(v("establecimientoId"));
  const [archivo, setArchivo] = useState<{ nombre: string; bytes: number; problema: string | null } | null>(null);

  const cambiarTipo = (nuevo: string) => {
    // Si el nombre era el sugerido para el tipo anterior (o está vacío), se sugiere el del nuevo tipo.
    if (nombre.trim() === "" || nombre === nombreSugerido(tipo)) setNombre(nombreSugerido(nuevo));
    setTipo(nuevo);
  };

  const normalizado = normalizarNombreDocumento(nombre);
  const cambiaAlNormalizar = nombre.trim() !== "" && normalizado !== nombre.trim().replace(/\s+/g, " ");
  const sugerirProducto = tipo === "REGISTRO_SANITARIO" && !productoId && opciones.productos.length > 0;
  const sugerirEstablecimiento =
    ["LICENCIA_SANITARIA", "AVISO_FUNCIONAMIENTO", "AVISO_RESPONSABLE"].includes(tipo) &&
    !establecimientoId &&
    opciones.establecimientos.length > 0;

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-6">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      {volver && <input type="hidden" name="volver" value={volver} />}

      {modo === "nuevo" && (
        <Campo
          etiqueta="Archivo"
          htmlFor="archivo"
          requerido
          errores={archivo?.problema ? [archivo.problema] : errores.archivo}
          ayuda={
            <>
              PDF, JPG, PNG o TIFF de hasta {MAX_MB_SUBIDA} MB. Se convierte automáticamente al formato de VUCEM: PDF en escala de
              grises a {limites.minDpi} dpi, sin formularios ni páginas en blanco, de máximo {limites.maxMB} MB.
            </>
          }
        >
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept={ACCEPT_SUBIDA}
            required
            aria-invalid={archivo?.problema || errores.archivo ? true : undefined}
            className="block w-full text-sm text-texto file:mr-3 file:rounded-md file:border file:border-borde file:bg-superficie file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-fondo"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              const problema = problemaArchivo(f);
              e.currentTarget.setCustomValidity(problema ?? "");
              setArchivo(f ? { nombre: f.name, bytes: f.size, problema } : null);
            }}
          />
          {archivo && !archivo.problema && (
            <p className="text-xs text-texto-suave">
              {archivo.nombre} · {formatoBytes(archivo.bytes)}
            </p>
          )}
        </Campo>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo de documento" htmlFor="tipo" requerido errores={errores.tipo}>
          <Selector
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value)}
            required
            aria-invalid={invalido("tipo")}
          >
            <option value="">Selecciona…</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_DOCUMENTO[t]}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          etiqueta="Vigencia (hasta)"
          htmlFor="vigenciaHasta"
          errores={errores.vigenciaHasta}
          ayuda="Opcional. Sirve para avisarte cuando esté por vencer."
        >
          <Entrada
            id="vigenciaHasta"
            name="vigenciaHasta"
            type="date"
            defaultValue={v("vigenciaHasta")}
            aria-invalid={invalido("vigenciaHasta")}
          />
        </Campo>

        <Campo
          etiqueta="Nombre descriptivo"
          htmlFor="nombre"
          requerido
          errores={errores.nombre}
          className="sm:col-span-2"
          ayuda={
            <>
              Es el nombre con el que se digitaliza en VUCEM: máximo {MAX_NOMBRE_DOCUMENTO} caracteres ({nombre.length}/
              {MAX_NOMBRE_DOCUMENTO}); se quitan símbolos como | &lt; &gt; o comillas.
              {cambiaAlNormalizar && normalizado && (
                <span className="mt-1 block text-aviso">Se guardará como: «{normalizado}»</span>
              )}
            </>
          }
        >
          <Entrada
            id="nombre"
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={MAX_NOMBRE_DOCUMENTO}
            required
            autoComplete="off"
            aria-invalid={invalido("nombre")}
          />
        </Campo>

        <Campo
          etiqueta="Producto"
          htmlFor="productoId"
          errores={errores.productoId}
          ayuda={
            sugerirProducto ? (
              <span className="text-aviso">Liga el registro sanitario a su producto para que la solicitud lo encuentre.</span>
            ) : (
              "Opcional. Para registros sanitarios, marbetes, etc."
            )
          }
        >
          <Selector
            id="productoId"
            name="productoId"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            aria-invalid={invalido("productoId")}
          >
            <option value="">— Ninguno —</option>
            {opciones.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
                {p.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          etiqueta="Establecimiento"
          htmlFor="establecimientoId"
          errores={errores.establecimientoId}
          ayuda={
            sugerirEstablecimiento ? (
              <span className="text-aviso">Liga la licencia o aviso a su establecimiento.</span>
            ) : (
              "Opcional. Para licencias sanitarias y avisos."
            )
          }
        >
          <Selector
            id="establecimientoId"
            name="establecimientoId"
            value={establecimientoId}
            onChange={(e) => setEstablecimientoId(e.target.value)}
            aria-invalid={invalido("establecimientoId")}
          >
            <option value="">— Ninguno —</option>
            {opciones.establecimientos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.etiqueta}
                {e.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          etiqueta="Tipo de documento en VUCEM (digitalización)"
          htmlFor="idTipoDocumentoVucem"
          errores={errores.idTipoDocumentoVucem}
          className="sm:col-span-2"
          ayuda="Opcional. Clave «idTipoDocumento» del servicio de digitalización de VUCEM con la que se genera el eDocument; puedes elegirla después, al digitalizar."
        >
          <CampoCatalogo
            id="idTipoDocumentoVucem"
            name="idTipoDocumentoVucem"
            opciones={opciones.tiposDocumentoVucem}
            valor={v("idTipoDocumentoVucem") || null}
            nombreCatalogo="Tipos de documento (digitalización)"
            maxLength={10}
            placeholder="Sin definir"
            invalido={Boolean(errores.idTipoDocumentoVucem)}
          />
        </Campo>
      </div>

      {pendiente && modo === "nuevo" && (
        <p role="status" aria-live="polite" className="text-sm text-texto-suave">
          Subiendo y convirtiendo el documento… En archivos grandes puede tardar hasta un par de minutos; no cierres la página.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? (modo === "nuevo" ? "Subiendo y convirtiendo…" : "Guardando…") : textoBoton}
        </Boton>
        {modo === "nuevo" && (
          <EnlaceBoton href={volver ?? "/documentos"} variante="secundario">
            Cancelar
          </EnlaceBoton>
        )}
      </div>
    </form>
  );
}
