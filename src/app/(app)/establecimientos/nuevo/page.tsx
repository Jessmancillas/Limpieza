import { Aviso, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { obtenerOpcionesCatalogo } from "@/lib/catalogos";

import { guardarEstablecimiento } from "../acciones";
import { FormularioEstablecimiento } from "../formulario";

export default async function NuevoEstablecimiento() {
  const ctx = await obtenerContexto();
  const [opcionesEntidad, opcionesScian] = await Promise.all([
    obtenerOpcionesCatalogo("CAT_ENTIDAD"),
    obtenerOpcionesCatalogo("CAT_SCIAN"),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo establecimiento"
        descripcion="Datos del almacén o establecimiento que recibe la mercancía (campos 3 a 16 de la solicitud). Se capturan una vez y se reutilizan en cada solicitud."
        migas={[{ etiqueta: "Establecimientos", href: "/establecimientos" }, { etiqueta: "Nuevo" }]}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta: no puedes dar de alta establecimientos.</Aviso>
      ) : (
        <Tarjeta>
          <FormularioEstablecimiento
            accion={guardarEstablecimiento.bind(null, null)}
            inicial={{
              denominacionRazonSocial: "",
              rfcResponsableSanitario: "",
              correoElectronico: "",
              telefono: "",
              calle: "",
              numeroExterior: null,
              codigoPostal: "",
              entidadFederativa: "",
              municipio: "",
              colonia: null,
              localidad: null,
              noLicenciaSanitaria: null,
              tieneAvisoFuncionamiento: false,
              scian: [],
            }}
            opcionesEntidad={opcionesEntidad}
            opcionesScian={opcionesScian}
            textoBoton="Crear establecimiento"
          />
        </Tarjeta>
      )}
    </>
  );
}
