"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AreaTexto, Campo, EnlaceBoton, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";
import { LIMITES_PRODUCTO as L } from "@/lib/validacion/producto";

import { CampoCatalogo } from "../establecimientos/_compartido/campo-catalogo";
import { useFormularioAccion, type AccionFormulario } from "../establecimientos/_compartido/use-formulario";

export type ValoresProducto = {
  denominacionEspecifica: string;
  denominacionDistintiva: string;
  denominacionComunCientifica: string;
  idClasificacionProducto: string | null;
  idSubClasificacionProducto: string | null;
  idTipoProducto: string | null;
  especifique: string | null;
  idFormaFarmaceutica: string | null;
  idEstadoFisico: string | null;
  fraccionArancelaria: string;
  descripcionFraccion: string | null;
  umt: string | null;
  umc: string | null;
  desUMC: string;
  presentacionTipoEnvase: string;
  numRegistroSanitario: string | null;
  /** yyyy-mm-dd */
  vigenciaRegistroSanitario: string;
  cvePaisOrigen: string | null;
  idUsoEspecifico: string | null;
  fabricanteId: string | null;
  notas: string | null;
};

export type OpcionesProducto = {
  clasificacion: OpcionCatalogo[];
  subclasificacion: OpcionCatalogo[];
  tipoProducto: OpcionCatalogo[];
  formaFarmaceutica: OpcionCatalogo[];
  estadoFisico: OpcionCatalogo[];
  unidadMedida: OpcionCatalogo[];
  pais: OpcionCatalogo[];
  usoEspecifico: OpcionCatalogo[];
  fabricantes: Array<{ id: string; nombre: string; pais: string; activo: boolean }>;
};

export function FormularioProducto({
  accion,
  inicial,
  opciones,
  rutaActual,
  textoBoton = "Guardar",
}: {
  accion: AccionFormulario;
  inicial: ValoresProducto;
  opciones: OpcionesProducto;
  /** Ruta a la que se regresa después de dar de alta un fabricante. */
  rutaActual: string;
  textoBoton?: string;
}) {
  const { estado, despachar, alEnviar, refMensaje } = useFormularioAccion(accion);
  const errores = estado.errores ?? {};
  const [clasificacion, setClasificacion] = useState(inicial.idClasificacionProducto ?? "");
  const [desUMC, setDesUMC] = useState(inicial.desUMC);
  const [umc, setUmc] = useState(inicial.umc ?? "");
  const unidades = useMemo(() => new Map(opciones.unidadMedida.map((o) => [o.clave, o.descripcion])), [opciones.unidadMedida]);
  // Lo enviado tiene prioridad (sirve si el formulario se envió sin JavaScript y hubo errores).
  const v = (k: keyof ValoresProducto) => estado.valores?.[k] ?? inicial[k] ?? "";
  const invalido = (k: string) => (errores[k] ? true : undefined);

  const cambiarUmc = (clave: string) => {
    // Propone la descripción de la UMC desde el catálogo si estaba vacía o era la sugerida antes.
    const sugerida = unidades.get(clave);
    if (sugerida && (desUMC.trim() === "" || desUMC === unidades.get(umc))) setDesUMC(sugerida.slice(0, L.desUMC));
    setUmc(clave);
  };

  const hayCatalogoSubclasificacion = opciones.subclasificacion.length > 0;
  const subclasificacionInicial = clasificacion === (inicial.idClasificacionProducto ?? "") ? inicial.idSubClasificacionProducto : "";
  const hrefNuevoFabricante = `/terceros/nuevo?tipo=FABRICANTE&volver=${encodeURIComponent(rutaActual)}`;

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-8">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Identificación del dispositivo médico</legend>
        <Campo
          etiqueta="Denominación específica"
          htmlFor="denominacionEspecifica"
          requerido
          errores={errores.denominacionEspecifica}
          className="sm:col-span-2"
          ayuda="Como aparece en el registro sanitario."
        >
          <Entrada
            id="denominacionEspecifica"
            name="denominacionEspecifica"
            defaultValue={v("denominacionEspecifica")}
            maxLength={L.denominacionEspecifica}
            required
            aria-invalid={invalido("denominacionEspecifica")}
          />
        </Campo>
        <Campo etiqueta="Denominación distintiva (marca)" htmlFor="denominacionDistintiva" requerido errores={errores.denominacionDistintiva}>
          <Entrada
            id="denominacionDistintiva"
            name="denominacionDistintiva"
            defaultValue={v("denominacionDistintiva")}
            maxLength={L.denominacionDistintiva}
            required
            aria-invalid={invalido("denominacionDistintiva")}
          />
        </Campo>
        <Campo
          etiqueta="Denominación común o nombre científico"
          htmlFor="denominacionComunCientifica"
          requerido
          errores={errores.denominacionComunCientifica}
        >
          <Entrada
            id="denominacionComunCientifica"
            name="denominacionComunCientifica"
            defaultValue={v("denominacionComunCientifica")}
            maxLength={L.denominacionComunCientifica}
            required
            aria-invalid={invalido("denominacionComunCientifica")}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Clasificación</legend>
        <Campo etiqueta="Clasificación del producto" htmlFor="idClasificacionProducto" requerido errores={errores.idClasificacionProducto}>
          <CampoCatalogo
            id="idClasificacionProducto"
            name="idClasificacionProducto"
            opciones={opciones.clasificacion}
            valor={inicial.idClasificacionProducto}
            nombreCatalogo="Clasificación del producto"
            maxLength={L.idClasificacionProducto}
            required
            invalido={invalido("idClasificacionProducto")}
            onCambio={setClasificacion}
          />
        </Campo>
        <Campo
          etiqueta="Subclasificación del producto"
          htmlFor="idSubClasificacionProducto"
          requerido
          errores={errores.idSubClasificacionProducto}
        >
          {hayCatalogoSubclasificacion && clasificacion === "" ? (
            <Selector id="idSubClasificacionProducto" disabled>
              <option>Elige primero la clasificación</option>
            </Selector>
          ) : (
            <CampoCatalogo
              key={hayCatalogoSubclasificacion ? `subclasificacion-${clasificacion}` : "subclasificacion-libre"}
              id="idSubClasificacionProducto"
              name="idSubClasificacionProducto"
              opciones={opciones.subclasificacion}
              filtroPadre={hayCatalogoSubclasificacion ? clasificacion : undefined}
              valor={hayCatalogoSubclasificacion ? subclasificacionInicial : inicial.idSubClasificacionProducto}
              nombreCatalogo="Subclasificación del producto"
              maxLength={L.idSubClasificacionProducto}
              required
              invalido={invalido("idSubClasificacionProducto")}
            />
          )}
        </Campo>
        <Campo etiqueta="Tipo de producto" htmlFor="idTipoProducto" requerido errores={errores.idTipoProducto}>
          <CampoCatalogo
            id="idTipoProducto"
            name="idTipoProducto"
            opciones={opciones.tipoProducto}
            valor={inicial.idTipoProducto}
            nombreCatalogo="Tipo de producto"
            maxLength={L.idTipoProducto}
            required
            invalido={invalido("idTipoProducto")}
          />
        </Campo>
        <Campo etiqueta="Especifique" htmlFor="especifique" errores={errores.especifique} ayuda="Detalle adicional del tipo de producto, si aplica.">
          <Entrada id="especifique" name="especifique" defaultValue={v("especifique")} maxLength={L.especifique} aria-invalid={invalido("especifique")} />
        </Campo>
        <Campo
          etiqueta="Forma farmacéutica"
          htmlFor="idFormaFarmaceutica"
          errores={errores.idFormaFarmaceutica}
          ayuda="Opcional aquí: es un dato de medicamentos, pero el manual de VUCEM lo marca obligatorio. La validación de la solicitud te avisará si hace falta."
        >
          <CampoCatalogo
            id="idFormaFarmaceutica"
            name="idFormaFarmaceutica"
            opciones={opciones.formaFarmaceutica}
            valor={inicial.idFormaFarmaceutica}
            nombreCatalogo="Forma farmacéutica"
            maxLength={L.idFormaFarmaceutica}
            placeholder="No aplica / sin elegir"
            invalido={invalido("idFormaFarmaceutica")}
          />
        </Campo>
        <Campo
          etiqueta="Estado físico"
          htmlFor="idEstadoFisico"
          errores={errores.idEstadoFisico}
          ayuda="Opcional aquí por la misma razón que la forma farmacéutica; la validación de la solicitud te avisará."
        >
          <CampoCatalogo
            id="idEstadoFisico"
            name="idEstadoFisico"
            opciones={opciones.estadoFisico}
            valor={inicial.idEstadoFisico}
            nombreCatalogo="Estado físico"
            maxLength={L.idEstadoFisico}
            placeholder="No aplica / sin elegir"
            invalido={invalido("idEstadoFisico")}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Comercio exterior</legend>
        <Campo
          etiqueta="Fracción arancelaria"
          htmlFor="fraccionArancelaria"
          requerido
          errores={errores.fraccionArancelaria}
          ayuda="8 dígitos de la TIGIE, sin puntos."
        >
          <Entrada
            id="fraccionArancelaria"
            name="fraccionArancelaria"
            defaultValue={v("fraccionArancelaria")}
            maxLength={8}
            inputMode="numeric"
            pattern="\d{8}"
            title="8 dígitos"
            required
            autoComplete="off"
            className="font-mono"
            aria-invalid={invalido("fraccionArancelaria")}
          />
        </Campo>
        <Campo etiqueta="Descripción de la fracción" htmlFor="descripcionFraccion" errores={errores.descripcionFraccion}>
          <Entrada
            id="descripcionFraccion"
            name="descripcionFraccion"
            defaultValue={v("descripcionFraccion")}
            maxLength={L.descripcionFraccion}
            aria-invalid={invalido("descripcionFraccion")}
          />
        </Campo>
        <Campo etiqueta="Unidad de medida tarifaria (UMT)" htmlFor="umt" errores={errores.umt}>
          <CampoCatalogo
            id="umt"
            name="umt"
            opciones={opciones.unidadMedida}
            valor={inicial.umt}
            nombreCatalogo="Unidades de medida"
            maxLength={L.unidadMedida}
            invalido={invalido("umt")}
          />
        </Campo>
        <Campo etiqueta="Unidad de medida comercial (UMC)" htmlFor="umc" errores={errores.umc}>
          <CampoCatalogo
            id="umc"
            name="umc"
            opciones={opciones.unidadMedida}
            valor={inicial.umc}
            nombreCatalogo="Unidades de medida"
            maxLength={L.unidadMedida}
            invalido={invalido("umc")}
            onCambio={cambiarUmc}
          />
        </Campo>
        <Campo
          etiqueta="Descripción de la unidad de medida comercial"
          htmlFor="desUMC"
          requerido
          errores={errores.desUMC}
          ayuda="Se propone a partir de la UMC; puedes modificarla (p. ej. PIEZA, CAJA)."
        >
          <Entrada
            id="desUMC"
            name="desUMC"
            value={desUMC}
            onChange={(e) => setDesUMC(e.target.value)}
            maxLength={L.desUMC}
            required
            aria-invalid={invalido("desUMC")}
          />
        </Campo>
        <Campo etiqueta="País de origen" htmlFor="cvePaisOrigen" requerido errores={errores.cvePaisOrigen}>
          <CampoCatalogo
            id="cvePaisOrigen"
            name="cvePaisOrigen"
            opciones={opciones.pais}
            valor={inicial.cvePaisOrigen}
            nombreCatalogo="Países"
            maxLength={3}
            required
            invalido={invalido("cvePaisOrigen")}
          />
        </Campo>
        <Campo
          etiqueta="Presentación o tipo de envase"
          htmlFor="presentacionTipoEnvase"
          requerido
          errores={errores.presentacionTipoEnvase}
          className="sm:col-span-2"
          ayuda={`Máximo ${L.presentacionTipoEnvase} caracteres. Ej.: CAJA CON 100 PIEZAS.`}
        >
          <AreaTexto
            id="presentacionTipoEnvase"
            name="presentacionTipoEnvase"
            defaultValue={v("presentacionTipoEnvase")}
            maxLength={L.presentacionTipoEnvase}
            rows={2}
            required
            aria-invalid={invalido("presentacionTipoEnvase")}
          />
        </Campo>
        <Campo etiqueta="Uso específico" htmlFor="idUsoEspecifico" requerido errores={errores.idUsoEspecifico}>
          <CampoCatalogo
            id="idUsoEspecifico"
            name="idUsoEspecifico"
            opciones={opciones.usoEspecifico}
            valor={inicial.idUsoEspecifico}
            nombreCatalogo="Uso específico"
            maxLength={L.idUsoEspecifico}
            required
            invalido={invalido("idUsoEspecifico")}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Registro sanitario y fabricante</legend>
        <Campo etiqueta="Número de registro sanitario" htmlFor="numRegistroSanitario" errores={errores.numRegistroSanitario}>
          <Entrada
            id="numRegistroSanitario"
            name="numRegistroSanitario"
            defaultValue={v("numRegistroSanitario")}
            maxLength={L.numRegistroSanitario}
            autoComplete="off"
            aria-invalid={invalido("numRegistroSanitario")}
          />
        </Campo>
        <Campo
          etiqueta="Vigencia del registro sanitario"
          htmlFor="vigenciaRegistroSanitario"
          errores={errores.vigenciaRegistroSanitario}
          ayuda="Te avisaremos cuando falten 90 días o menos."
        >
          <Entrada
            id="vigenciaRegistroSanitario"
            name="vigenciaRegistroSanitario"
            type="date"
            defaultValue={v("vigenciaRegistroSanitario")}
            aria-invalid={invalido("vigenciaRegistroSanitario")}
          />
        </Campo>
        <Campo
          etiqueta="Fabricante"
          htmlFor="fabricanteId"
          errores={errores.fabricanteId}
          className="sm:col-span-2"
          ayuda={
            <>
              <Link href={hrefNuevoFabricante} className="text-primario hover:underline">
                + Nuevo fabricante
              </Link>{" "}
              (lo no guardado en esta pantalla se perderá; al terminar regresarás aquí).
            </>
          }
        >
          <Selector id="fabricanteId" name="fabricanteId" defaultValue={inicial.fabricanteId ?? ""} aria-invalid={invalido("fabricanteId")}>
            <option value="">Sin fabricante</option>
            {opciones.fabricantes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre} ({f.pais}){f.activo ? "" : " — inactivo"}
              </option>
            ))}
          </Selector>
        </Campo>
      </fieldset>

      <Campo etiqueta="Notas internas" htmlFor="notas" errores={errores.notas} ayuda="No se envían a VUCEM.">
        <AreaTexto id="notas" name="notas" defaultValue={v("notas")} maxLength={L.notas} rows={3} aria-invalid={invalido("notas")} />
      </Campo>

      <div className="flex flex-wrap gap-3">
        <BotonEnviar>{textoBoton}</BotonEnviar>
        <EnlaceBoton href="/productos" variante="secundario">
          Cancelar
        </EnlaceBoton>
      </div>
    </form>
  );
}
