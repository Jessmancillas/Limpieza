import { Aviso, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { TIPOS_DOCUMENTO, type TipoDocumento } from "@/lib/constantes";
import { db } from "@/lib/db";

import { cargarOpcionesDocumento, limitesPdfVigentes } from "../_lib/servidor";
import { parametro, rutaInternaSegura } from "../_lib/utilidades";
import { crearDocumento } from "../acciones";
import { FormularioDocumento } from "../formulario";

/**
 * Alta de documento. Acepta ?tipo=&productoId=&establecimientoId=&volver= para prellenar
 * (lo usan las fichas de producto y de establecimiento).
 */
export default async function NuevoDocumento({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const tipoParam = parametro(sp.tipo);
  const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(tipoParam) ? (tipoParam as TipoDocumento) : "";
  const volver = rutaInternaSegura(parametro(sp.volver));
  const productoIdParam = parametro(sp.productoId).slice(0, 40);
  const establecimientoIdParam = parametro(sp.establecimientoId).slice(0, 40);

  // Solo se prellenan ligas que pertenecen a la empresa activa.
  const [producto, establecimiento] = await Promise.all([
    productoIdParam
      ? db.producto.findFirst({ where: { id: productoIdParam, empresaId }, select: { id: true, denominacionEspecifica: true } })
      : null,
    establecimientoIdParam
      ? db.establecimiento.findFirst({
          where: { id: establecimientoIdParam, empresaId },
          select: { id: true, denominacionRazonSocial: true },
        })
      : null,
  ]);
  const [opciones, limites] = await Promise.all([
    cargarOpcionesDocumento(empresaId, { productoId: producto?.id, establecimientoId: establecimiento?.id }),
    limitesPdfVigentes(),
  ]);

  const migas = producto
    ? [
        { etiqueta: "Productos", href: "/productos" },
        { etiqueta: producto.denominacionEspecifica, href: `/productos/${producto.id}` },
        { etiqueta: "Subir documento" },
      ]
    : establecimiento
      ? [
          { etiqueta: "Establecimientos", href: "/establecimientos" },
          { etiqueta: establecimiento.denominacionRazonSocial, href: `/establecimientos/${establecimiento.id}` },
          { etiqueta: "Subir documento" },
        ]
      : [{ etiqueta: "Documentos", href: "/documentos" }, { etiqueta: "Subir" }];

  return (
    <>
      <EncabezadoPagina
        titulo="Subir documento"
        descripcion="Sube el archivo tal como lo tengas (PDF escaneado, foto o imagen). Se genera automáticamente la versión que acepta VUCEM y se guarda también el original."
        migas={migas}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta: no puedes subir documentos.</Aviso>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
          <Tarjeta>
            <FormularioDocumento
              modo="nuevo"
              accion={crearDocumento}
              inicial={{
                tipo,
                nombre: "",
                idTipoDocumentoVucem: null,
                productoId: producto?.id ?? null,
                establecimientoId: establecimiento?.id ?? null,
                vigenciaHasta: "",
              }}
              opciones={opciones}
              limites={limites}
              volver={volver}
              textoBoton="Subir y convertir"
            />
          </Tarjeta>
          <Tarjeta titulo="Qué pide VUCEM">
            <ul className="list-disc space-y-2 pl-4 text-sm text-texto-suave">
              <li>PDF sin formularios, sin JavaScript ni objetos incrustados.</li>
              <li>Imágenes en escala de grises de al menos {limites.minDpi} dpi.</li>
              <li>Sin páginas en blanco.</li>
              <li>Máximo {limites.maxMB} MB por archivo (en algunas pantallas de VUCEM clásica, 3 MB).</li>
            </ul>
            <p className="mt-3 text-xs text-texto-suave">
              La conversión cumple todo esto: cada página se convierte en imagen y se arma un PDF nuevo. Revisa el resultado
              antes de digitalizarlo.
            </p>
          </Tarjeta>
        </div>
      )}
    </>
  );
}
