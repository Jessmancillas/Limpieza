"use client";

import { useState } from "react";

import { Campo, Entrada, Selector } from "@/components/ui";

type Valores = Partial<Record<string, string | null>>;

/**
 * Campos del solicitante (empresa). Se usan en el registro, al dar de alta una empresa
 * cliente y en Configuración → Empresa.
 */
export function CamposEmpresa({
  valores = {},
  errores = {},
}: {
  valores?: Valores;
  errores?: Record<string, string[]>;
}) {
  const [tipoPersona, setTipoPersona] = useState(valores.tipoPersona ?? "MORAL");
  const v = (k: string) => valores[k] ?? "";

  return (
    <div className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Datos del solicitante</legend>
        <Campo etiqueta="Tipo de persona" htmlFor="tipoPersona" requerido errores={errores.tipoPersona}>
          <Selector
            id="tipoPersona"
            name="tipoPersona"
            value={tipoPersona}
            onChange={(e) => setTipoPersona(e.target.value)}
          >
            <option value="MORAL">Persona moral</option>
            <option value="FISICA">Persona física</option>
          </Selector>
        </Campo>
        <Campo etiqueta="RFC" htmlFor="rfc" requerido errores={errores.rfc} ayuda="En mayúsculas, como aparece en tu e.firma.">
          <Entrada id="rfc" name="rfc" defaultValue={v("rfc")} maxLength={13} autoComplete="off" className="uppercase" required />
        </Campo>
        {tipoPersona === "MORAL" ? (
          <Campo etiqueta="Razón social" htmlFor="razonSocial" requerido errores={errores.razonSocial} className="sm:col-span-2">
            <Entrada id="razonSocial" name="razonSocial" defaultValue={v("razonSocial")} maxLength={254} />
          </Campo>
        ) : (
          <>
            <Campo etiqueta="Nombre(s)" htmlFor="nombre" requerido errores={errores.nombre}>
              <Entrada id="nombre" name="nombre" defaultValue={v("nombre")} maxLength={200} />
            </Campo>
            <Campo etiqueta="Apellido paterno" htmlFor="apellidoPaterno" requerido errores={errores.apellidoPaterno}>
              <Entrada id="apellidoPaterno" name="apellidoPaterno" defaultValue={v("apellidoPaterno")} maxLength={200} />
            </Campo>
            <Campo etiqueta="Apellido materno" htmlFor="apellidoMaterno" errores={errores.apellidoMaterno}>
              <Entrada id="apellidoMaterno" name="apellidoMaterno" defaultValue={v("apellidoMaterno")} maxLength={200} />
            </Campo>
            <Campo etiqueta="CURP" htmlFor="curp" errores={errores.curp}>
              <Entrada id="curp" name="curp" defaultValue={v("curp")} maxLength={18} className="uppercase" />
            </Campo>
            <Campo etiqueta="Actividad productiva" htmlFor="actividadProductiva" errores={errores.actividadProductiva} className="sm:col-span-2">
              <Entrada id="actividadProductiva" name="actividadProductiva" defaultValue={v("actividadProductiva")} maxLength={200} />
            </Campo>
          </>
        )}
        <Campo etiqueta="Correo electrónico" htmlFor="correoElectronico" requerido errores={errores.correoElectronico}>
          <Entrada id="correoElectronico" name="correoElectronico" type="email" defaultValue={v("correoElectronico")} maxLength={320} />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="telefono" errores={errores.telefono}>
          <Entrada id="telefono" name="telefono" defaultValue={v("telefono")} maxLength={30} />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold">Domicilio fiscal</legend>
        <p className="text-xs text-texto-suave sm:col-span-3">
          Captúralo exactamente como está registrado en VUCEM: estos datos forman parte de la cadena original que se firma.
        </p>
        <Campo etiqueta="Calle" htmlFor="calle" errores={errores.calle} className="sm:col-span-2">
          <Entrada id="calle" name="calle" defaultValue={v("calle")} maxLength={120} />
        </Campo>
        <Campo etiqueta="Número exterior" htmlFor="numeroExterior" errores={errores.numeroExterior}>
          <Entrada id="numeroExterior" name="numeroExterior" defaultValue={v("numeroExterior")} maxLength={55} />
        </Campo>
        <Campo etiqueta="Número interior" htmlFor="numeroInterior" errores={errores.numeroInterior}>
          <Entrada id="numeroInterior" name="numeroInterior" defaultValue={v("numeroInterior")} maxLength={55} />
        </Campo>
        <Campo etiqueta="Código postal" htmlFor="codigoPostal" errores={errores.codigoPostal}>
          <Entrada id="codigoPostal" name="codigoPostal" defaultValue={v("codigoPostal")} maxLength={12} inputMode="numeric" />
        </Campo>
        <Campo etiqueta="Colonia" htmlFor="colonia" errores={errores.colonia}>
          <Entrada id="colonia" name="colonia" defaultValue={v("colonia")} maxLength={120} />
        </Campo>
        <Campo etiqueta="Localidad" htmlFor="localidad" errores={errores.localidad}>
          <Entrada id="localidad" name="localidad" defaultValue={v("localidad")} maxLength={120} />
        </Campo>
        <Campo etiqueta="Municipio o alcaldía" htmlFor="municipio" errores={errores.municipio}>
          <Entrada id="municipio" name="municipio" defaultValue={v("municipio")} maxLength={120} />
        </Campo>
        <Campo etiqueta="Entidad federativa" htmlFor="entidadFederativa" errores={errores.entidadFederativa}>
          <Entrada id="entidadFederativa" name="entidadFederativa" defaultValue={v("entidadFederativa")} maxLength={60} />
        </Campo>
        <input type="hidden" name="pais" value={v("pais") || "MEX"} />
      </fieldset>
    </div>
  );
}
