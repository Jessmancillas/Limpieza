import { Aviso, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";

import { guardarProducto } from "../acciones";
import { FormularioProducto } from "../formulario";
import { cargarOpcionesProducto } from "../opciones";

export default async function NuevoProducto({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const opciones = await cargarOpcionesProducto(ctx.empresa.id);
  // Al regresar de dar de alta un fabricante (?nuevoTerceroId=), se preselecciona.
  const nuevoTerceroId = Array.isArray(sp.nuevoTerceroId) ? sp.nuevoTerceroId[0] : sp.nuevoTerceroId;
  const fabricanteNuevo = opciones.fabricantes.find((f) => f.id === nuevoTerceroId);

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo producto"
        descripcion="Dispositivo médico que importas con frecuencia (campos 19 a 37 de la solicitud). En cada solicitud solo capturarás cantidades, caducidad y país de procedencia."
        migas={[{ etiqueta: "Productos", href: "/productos" }, { etiqueta: "Nuevo" }]}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta: no puedes dar de alta productos.</Aviso>
      ) : (
        <div className="space-y-4">
          {fabricanteNuevo && <Aviso tono="exito">Fabricante «{fabricanteNuevo.nombre}» creado y seleccionado.</Aviso>}
          <Tarjeta>
            <FormularioProducto
              accion={guardarProducto.bind(null, null)}
              inicial={{
                denominacionEspecifica: "",
                denominacionDistintiva: "",
                denominacionComunCientifica: "",
                idClasificacionProducto: null,
                idSubClasificacionProducto: null,
                idTipoProducto: null,
                especifique: null,
                idFormaFarmaceutica: null,
                idEstadoFisico: null,
                fraccionArancelaria: "",
                descripcionFraccion: null,
                umt: null,
                umc: null,
                desUMC: "",
                presentacionTipoEnvase: "",
                numRegistroSanitario: null,
                vigenciaRegistroSanitario: "",
                cvePaisOrigen: null,
                idUsoEspecifico: null,
                fabricanteId: fabricanteNuevo?.id ?? null,
                notas: null,
              }}
              opciones={opciones}
              rutaActual="/productos/nuevo"
              textoBoton="Crear producto"
            />
          </Tarjeta>
        </div>
      )}
    </>
  );
}
