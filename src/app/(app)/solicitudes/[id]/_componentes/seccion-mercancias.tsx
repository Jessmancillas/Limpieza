"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Campo, Entrada, Insignia, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";

import { CampoCatalogo } from "../../../establecimientos/_compartido/campo-catalogo";
import { BotonAccion } from "../../_componentes/boton-accion";
import { useAccion, type AccionFormulario } from "../../_componentes/usar-accion";

export type ValoresPartida = {
  idClasificacionProducto: string | null;
  idSubClasificacionProducto: string | null;
  denominacionEspecifica: string;
  denominacionDistintiva: string;
  denominacionComunCientifica: string;
  idTipoProducto: string | null;
  especifique: string | null;
  idFormaFarmaceutica: string | null;
  idEstadoFisico: string | null;
  fraccionArancelaria: string;
  descripcionFraccion: string | null;
  cantidadUMT: string;
  cantidadUMC: string;
  umt: string | null;
  umc: string | null;
  desUMC: string;
  presentacionTipoEnvase: string;
  numRegistroSanitario: string | null;
  /** aaaa-mm-dd */
  fechaCaducidad: string;
  cvePaisOrigen: string;
  cvePaisProcedencia: string;
  idUsoEspecifico: string | null;
};

export type PartidaVista = {
  id: string;
  productoId: string | null;
  resultado: string | null;
  valores: ValoresPartida;
  accionGuardar: AccionFormulario;
  accionQuitar: AccionFormulario;
  accionRecopiar: AccionFormulario | null;
};

export type ProductoOpcion = {
  id: string;
  nombre: string;
  marca: string;
  fraccion: string;
  registro: string | null;
  cvePaisOrigen: string | null;
  idUsoEspecifico: string | null;
  desUMC: string;
  /** Texto del estado del registro (vencido / por vencer) si aplica. */
  alerta: string | null;
};

export type OpcionesMercancia = {
  clasificacion: OpcionCatalogo[];
  subclasificacion: OpcionCatalogo[];
  tipoProducto: OpcionCatalogo[];
  formaFarmaceutica: OpcionCatalogo[];
  estadoFisico: OpcionCatalogo[];
  unidadMedida: OpcionCatalogo[];
  pais: OpcionCatalogo[];
  usoEspecifico: OpcionCatalogo[];
};

export function SeccionMercancias({
  partidas,
  productos,
  opciones,
  accionAgregar,
  soloLectura,
}: {
  partidas: PartidaVista[];
  productos: ProductoOpcion[];
  opciones: OpcionesMercancia;
  accionAgregar: AccionFormulario;
  soloLectura: boolean;
}) {
  const paises = useMemo(() => new Map(opciones.pais.map((o) => [o.clave, o.descripcion])), [opciones.pais]);
  return (
    <div className="space-y-4">
      {partidas.length === 0 ? (
        <p className="text-sm text-texto-suave">Aún no hay mercancías. Agrégalas desde tu catálogo de productos.</p>
      ) : (
        <ol className="space-y-3">
          {partidas.map((p, i) => (
            <li key={p.id} className="rounded-md border border-borde">
              <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {i + 1}. {p.valores.denominacionEspecifica}
                    <span className="font-normal text-texto-suave"> · {p.valores.denominacionDistintiva}</span>
                  </p>
                  <p className="text-xs text-texto-suave">
                    Fracción <span className="font-mono">{p.valores.fraccionArancelaria}</span> · {p.valores.cantidadUMC} {p.valores.desUMC} (UMT{" "}
                    {p.valores.cantidadUMT}) · Registro {p.valores.numRegistroSanitario || "—"} · Origen{" "}
                    {paises.get(p.valores.cvePaisOrigen) ?? (p.valores.cvePaisOrigen || "—")} · Procedencia{" "}
                    {paises.get(p.valores.cvePaisProcedencia) ?? (p.valores.cvePaisProcedencia || "—")}
                  </p>
                  {!p.productoId && <p className="text-xs text-aviso">Ya no está ligada a un producto del catálogo.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.resultado && <Insignia tono={p.resultado === "ACEPTADA" ? "exito" : "peligro"}>{p.resultado === "ACEPTADA" ? "Aceptada" : "Rechazada"}</Insignia>}
                  {!soloLectura && (
                    <BotonAccion
                      accion={p.accionQuitar}
                      variante="fantasma"
                      textoEnviando="Quitando…"
                      confirmar={`¿Quitar la mercancía «${p.valores.denominacionEspecifica}» de la solicitud?`}
                    >
                      Quitar
                    </BotonAccion>
                  )}
                </div>
              </div>
              <details className="border-t border-borde px-4 py-2">
                <summary className="cursor-pointer text-sm text-primario">{soloLectura ? "Ver todos los datos" : "Ver y editar todos los datos"}</summary>
                <div className="mt-3 space-y-3">
                  {!soloLectura && p.accionRecopiar && (
                    <BotonAccion
                      accion={p.accionRecopiar}
                      textoEnviando="Copiando…"
                      confirmar="Se reemplazarán los datos de la mercancía por los del producto del catálogo (se conservan cantidades, procedencia y caducidad). ¿Continuar?"
                    >
                      Volver a copiar del producto
                    </BotonAccion>
                  )}
                  <FormPartida accion={p.accionGuardar} prefijo={`pa${i}`} inicial={p.valores} opciones={opciones} soloLectura={soloLectura} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      {!soloLectura && <FormAgregarPartida accion={accionAgregar} productos={productos} opciones={opciones} />}
    </div>
  );
}

function FormAgregarPartida({
  accion,
  productos,
  opciones,
}: {
  accion: AccionFormulario;
  productos: ProductoOpcion[];
  opciones: OpcionesMercancia;
}) {
  const { estado, despachar, alEnviar, refForm, refMensaje, err, inv } = useAccion(accion, { reiniciar: true });
  const [productoId, setProductoId] = useState("");
  const producto = productos.find((p) => p.id === productoId);

  if (productos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-3 text-sm text-texto-suave">
        No hay productos activos en el catálogo.{" "}
        <Link href="/productos/nuevo" className="text-primario hover:underline">
          Da de alta un producto
        </Link>{" "}
        para agregarlo como mercancía.
      </p>
    );
  }

  return (
    <form
      ref={refForm}
      action={despachar}
      onSubmit={alEnviar}
      onReset={() => setProductoId("")}
      className="space-y-4 rounded-md border border-dashed border-borde px-4 py-4"
    >
      <h3 className="text-sm font-semibold">Agregar mercancía desde el catálogo de productos</h3>
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Producto" htmlFor="ap-productoId" requerido errores={err("productoId")} className="sm:col-span-2">
          <Selector
            id="ap-productoId"
            name="productoId"
            required
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            aria-invalid={inv("productoId")}
          >
            <option value="">Selecciona…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.marca} · {p.fraccion}
                {p.alerta ? ` (${p.alerta})` : ""}
              </option>
            ))}
          </Selector>
        </Campo>
        {producto?.alerta && <p className="text-xs text-aviso sm:col-span-2">Registro sanitario: {producto.alerta}.</p>}
        <Campo etiqueta="Cantidad en UMT" htmlFor="ap-cantidadUMT" requerido errores={err("cantidadUMT")} ayuda="Hasta 3 decimales.">
          <Entrada id="ap-cantidadUMT" name="cantidadUMT" inputMode="decimal" required autoComplete="off" aria-invalid={inv("cantidadUMT")} />
        </Campo>
        <Campo
          etiqueta={`Cantidad en UMC${producto ? ` (${producto.desUMC})` : ""}`}
          htmlFor="ap-cantidadUMC"
          requerido
          errores={err("cantidadUMC")}
          ayuda="Hasta 3 decimales."
        >
          <Entrada id="ap-cantidadUMC" name="cantidadUMC" inputMode="decimal" required autoComplete="off" aria-invalid={inv("cantidadUMC")} />
        </Campo>
        <Campo etiqueta="País de procedencia" htmlFor="ap-cvePaisProcedencia" requerido errores={err("cvePaisProcedencia")}>
          <CampoCatalogo
            key={`pais-${productoId}`}
            id="ap-cvePaisProcedencia"
            name="cvePaisProcedencia"
            opciones={opciones.pais}
            valor={producto?.cvePaisOrigen ?? ""}
            nombreCatalogo="Países"
            maxLength={3}
            required
            invalido={!!err("cvePaisProcedencia")}
          />
        </Campo>
        <Campo
          etiqueta="Uso específico"
          htmlFor="ap-idUsoEspecifico"
          errores={err("idUsoEspecifico")}
          ayuda="Si lo dejas vacío se usa el del producto."
        >
          <CampoCatalogo
            key={`uso-${productoId}`}
            id="ap-idUsoEspecifico"
            name="idUsoEspecifico"
            opciones={opciones.usoEspecifico}
            valor={producto?.idUsoEspecifico ?? ""}
            nombreCatalogo="Uso específico"
            maxLength={4}
            invalido={!!err("idUsoEspecifico")}
          />
        </Campo>
        <Campo etiqueta="Fecha de caducidad (opcional)" htmlFor="ap-fechaCaducidad" errores={err("fechaCaducidad")}>
          <Entrada id="ap-fechaCaducidad" name="fechaCaducidad" type="date" aria-invalid={inv("fechaCaducidad")} />
        </Campo>
      </div>
      <p className="text-xs text-texto-suave">
        Se copian a la solicitud los datos del producto (denominaciones, clasificación, fracción, unidades, presentación y registro
        sanitario); después puedes ajustarlos aquí sin cambiar el catálogo. El fabricante del producto se agrega a los terceros.
      </p>
      <BotonEnviar textoEnviando="Agregando…">Agregar mercancía</BotonEnviar>
    </form>
  );
}

function FormPartida({
  accion,
  prefijo,
  inicial,
  opciones,
  soloLectura,
}: {
  accion: AccionFormulario;
  prefijo: string;
  inicial: ValoresPartida;
  opciones: OpcionesMercancia;
  soloLectura: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  const [clasificacion, setClasificacion] = useState(inicial.idClasificacionProducto ?? "");
  const hayFiltro = opciones.subclasificacion.some((o) => o.padreClave === clasificacion);
  const id = (campo: string) => `${prefijo}-${campo}`;
  const texto = (campo: keyof ValoresPartida, etiqueta: string, opc: { requerido?: boolean; max?: number; ayuda?: string; ancho?: boolean; decimal?: boolean } = {}) => (
    <Campo etiqueta={etiqueta} htmlFor={id(campo)} requerido={opc.requerido} errores={err(campo)} ayuda={opc.ayuda} className={opc.ancho ? "sm:col-span-2" : undefined}>
      <Entrada
        id={id(campo)}
        name={campo}
        defaultValue={inicial[campo] ?? ""}
        maxLength={opc.max}
        required={opc.requerido}
        inputMode={opc.decimal ? "decimal" : undefined}
        autoComplete="off"
        aria-invalid={inv(campo)}
      />
    </Campo>
  );
  const catalogo = (
    campo: keyof ValoresPartida,
    etiqueta: string,
    lista: OpcionCatalogo[],
    nombreCatalogo: string,
    opc: { requerido?: boolean; ayuda?: string; filtroPadre?: string | null; onCambio?: (v: string) => void; max?: number } = {},
  ) => (
    <Campo etiqueta={etiqueta} htmlFor={id(campo)} requerido={opc.requerido} errores={err(campo)} ayuda={opc.ayuda}>
      <CampoCatalogo
        id={id(campo)}
        name={campo}
        opciones={lista}
        valor={inicial[campo]}
        filtroPadre={opc.filtroPadre}
        nombreCatalogo={nombreCatalogo}
        maxLength={opc.max}
        required={opc.requerido}
        invalido={!!err(campo)}
        onCambio={opc.onCambio}
      />
    </Campo>
  );

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset disabled={soloLectura} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {texto("denominacionEspecifica", "Denominación específica", { requerido: true, max: 256, ancho: true })}
        {texto("denominacionDistintiva", "Denominación distintiva (marca)", { requerido: true, max: 120 })}
        {texto("denominacionComunCientifica", "Denominación común o nombre científico", { requerido: true, max: 500 })}
        {catalogo("idClasificacionProducto", "Clasificación del producto", opciones.clasificacion, "Clasificación del producto", {
          requerido: true,
          max: 14,
          onCambio: setClasificacion,
        })}
        {catalogo("idSubClasificacionProducto", "Subclasificación del producto", opciones.subclasificacion, "Subclasificación del producto", {
          requerido: true,
          max: 14,
          filtroPadre: hayFiltro ? clasificacion : undefined,
        })}
        {catalogo("idTipoProducto", "Tipo de producto", opciones.tipoProducto, "Tipo de producto", { requerido: true, max: 4 })}
        {texto("especifique", "Especifique", { max: 500 })}
        {catalogo("idFormaFarmaceutica", "Forma farmacéutica", opciones.formaFarmaceutica, "Forma farmacéutica", {
          ayuda: "El manual la marca requerida; en dispositivos médicos puede no aplicar.",
        })}
        {catalogo("idEstadoFisico", "Estado físico", opciones.estadoFisico, "Estado físico", {
          ayuda: "El manual lo marca requerido; en dispositivos médicos puede no aplicar.",
        })}
        {texto("fraccionArancelaria", "Fracción arancelaria", { requerido: true, max: 8, ayuda: "8 dígitos (TIGIE)." })}
        {texto("descripcionFraccion", "Descripción de la fracción", { max: 500 })}
        {texto("cantidadUMT", "Cantidad en UMT", { requerido: true, decimal: true, ayuda: "Hasta 3 decimales." })}
        {catalogo("umt", "Unidad de medida tarifaria (UMT)", opciones.unidadMedida, "Unidades de medida")}
        {texto("cantidadUMC", "Cantidad en UMC", { requerido: true, decimal: true, ayuda: "Hasta 3 decimales." })}
        {catalogo("umc", "Unidad de medida comercial (UMC)", opciones.unidadMedida, "Unidades de medida")}
        {texto("desUMC", "Descripción de la UMC", { requerido: true, max: 100 })}
        {texto("presentacionTipoEnvase", "Presentación o tipo de envase", { requerido: true, max: 250 })}
        {texto("numRegistroSanitario", "Número de registro sanitario", { max: 50, ayuda: "Obligatorio para este trámite." })}
        <Campo etiqueta="Fecha de caducidad" htmlFor={id("fechaCaducidad")} errores={err("fechaCaducidad")}>
          <Entrada id={id("fechaCaducidad")} name="fechaCaducidad" type="date" defaultValue={inicial.fechaCaducidad} aria-invalid={inv("fechaCaducidad")} />
        </Campo>
        {catalogo("cvePaisOrigen", "País de origen", opciones.pais, "Países", { requerido: true, max: 3 })}
        {catalogo("cvePaisProcedencia", "País de procedencia", opciones.pais, "Países", { requerido: true, max: 3 })}
        {catalogo("idUsoEspecifico", "Uso específico", opciones.usoEspecifico, "Uso específico", { requerido: true, max: 4 })}
      </fieldset>
      {!soloLectura && (
        <BotonEnviar variante="secundario" textoEnviando="Guardando…">
          Guardar mercancía
        </BotonEnviar>
      )}
    </form>
  );
}
