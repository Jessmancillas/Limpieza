import { Aviso, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { obtenerOpcionesCatalogo } from "@/lib/catalogos";
import { ETIQUETA_TIPO_TERCERO, TIPOS_TERCERO, type TipoTercero } from "@/lib/constantes";

import { rutaVolverSegura } from "../../establecimientos/_compartido/rutas";
import { guardarTercero } from "../acciones";
import { FormularioTercero } from "../formulario";

export default async function NuevoTercero({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const tipoParam = Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo;
  const tipo: TipoTercero = (TIPOS_TERCERO as readonly string[]).includes(tipoParam ?? "")
    ? (tipoParam as TipoTercero)
    : "FABRICANTE";
  const volver = rutaVolverSegura(Array.isArray(sp.volver) ? sp.volver[0] : sp.volver);
  const [opcionesPais, opcionesEntidad] = await Promise.all([
    obtenerOpcionesCatalogo("CAT_PAIS"),
    obtenerOpcionesCatalogo("CAT_ENTIDAD"),
  ]);
  // El destinatario (destino final de la mercancía) normalmente es nacional.
  const nacional = tipo === "DESTINATARIO";
  const etiqueta = ETIQUETA_TIPO_TERCERO[tipo].split(" ")[0].toLowerCase();

  return (
    <>
      <EncabezadoPagina
        titulo={`Nuevo ${etiqueta}`}
        descripcion="Los datos se copian a cada solicitud donde elijas este tercero."
        migas={[
          { etiqueta: "Terceros", href: "/terceros" },
          { etiqueta: ETIQUETA_TIPO_TERCERO[tipo], href: `/terceros?tipo=${tipo}` },
          { etiqueta: "Nuevo" },
        ]}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta: no puedes dar de alta terceros.</Aviso>
      ) : (
        <Tarjeta>
          {volver && (
            <p className="mb-4 text-sm text-texto-suave">Al guardar regresarás a la pantalla anterior con este tercero seleccionado.</p>
          )}
          <FormularioTercero
            accion={guardarTercero.bind(null, null)}
            inicial={{
              tipo,
              tipoPersona: "MORAL",
              nacionalidad: nacional ? "NACIONAL" : "EXTRANJERO",
              nombre: null,
              apellidoPaterno: null,
              apellidoMaterno: null,
              denominacionRazonSocial: null,
              rfc: null,
              curp: null,
              correoElectronico: null,
              pais: nacional ? "MEX" : "",
              entidadFederativa: null,
              municipio: null,
              colonia: null,
              localidad: null,
              codigoPostal: null,
              calle: "",
              numeroExterior: null,
              numeroInterior: null,
              lada: null,
              telefono: null,
            }}
            opcionesPais={opcionesPais}
            opcionesEntidad={opcionesEntidad}
            volver={volver}
            cancelarHref={`/terceros?tipo=${tipo}`}
            textoBoton={`Crear ${etiqueta}`}
          />
        </Tarjeta>
      )}
    </>
  );
}
