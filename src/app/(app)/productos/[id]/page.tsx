import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, Datos, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { describirClave } from "@/lib/catalogos";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_DOCUMENTO,
  type EstadoSolicitud,
  type TipoDocumento,
} from "@/lib/constantes";
import { db } from "@/lib/db";
import { fechaAInput, formatoFecha } from "@/lib/formularios";
import { estadoRegistroSanitario } from "@/lib/validacion/producto";
import { nombreTercero } from "@/lib/validacion/tercero";

import { AccionesRegistro } from "../../establecimientos/_compartido/acciones-registro";
import { cambiarActivoProducto, duplicarProducto, eliminarProducto, guardarProducto } from "../acciones";
import { BotonDuplicar } from "../boton-duplicar";
import { FormularioProducto } from "../formulario";
import { InsigniaRegistro } from "../insignia-registro";
import { cargarOpcionesProducto } from "../opciones";

export default async function DetalleProducto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const p = await db.producto.findFirst({
    where: { id, empresaId },
    include: {
      fabricante: {
        select: {
          id: true,
          tipoPersona: true,
          nombre: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          denominacionRazonSocial: true,
          pais: true,
        },
      },
      partidas: {
        where: { solicitud: { empresaId } },
        select: {
          id: true,
          cantidadUMC: true,
          desUMC: true,
          solicitud: { select: { id: true, numero: true, estado: true } },
        },
        orderBy: { solicitud: { numero: "desc" } },
        take: 30,
      },
      documentos: {
        where: { empresaId },
        select: { id: true, tipo: true, nombre: true, vigenciaHasta: true },
        orderBy: { creadoEn: "desc" },
      },
      _count: { select: { partidas: true } },
    },
  });
  if (!p) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const [opciones, solicitudesDistintas] = await Promise.all([
    puedeEditar ? cargarOpcionesProducto(empresaId, p.fabricanteId) : null,
    db.partidaSolicitud.findMany({
      where: { productoId: p.id, solicitud: { empresaId } },
      distinct: ["solicitudId"],
      select: { solicitudId: true },
    }),
  ]);
  const usos = solicitudesDistintas.length;
  const nuevoTerceroId = Array.isArray(sp.nuevoTerceroId) ? sp.nuevoTerceroId[0] : sp.nuevoTerceroId;
  const fabricanteNuevo = opciones?.fabricantes.find((f) => f.id === nuevoTerceroId);
  const registro = estadoRegistroSanitario(p);
  const tieneDocumentoRegistro = p.documentos.some((d) => d.tipo === "REGISTRO_SANITARIO");
  const hrefSubir = `/documentos/nuevo?tipo=REGISTRO_SANITARIO&productoId=${p.id}&volver=/productos/${p.id}`;

  return (
    <>
      <EncabezadoPagina
        titulo={p.denominacionEspecifica}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{p.denominacionDistintiva}</span>
            <span className="font-mono text-xs">{p.fraccionArancelaria}</span>
            <InsigniaRegistro numRegistroSanitario={p.numRegistroSanitario} vigenciaRegistroSanitario={p.vigenciaRegistroSanitario} />
            {p.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
          </span>
        }
        migas={[{ etiqueta: "Productos", href: "/productos" }, { etiqueta: p.denominacionEspecifica }]}
      />

      <div className="space-y-4">
        {sp.creado && <Aviso tono="exito">Producto creado.</Aviso>}
        {sp.duplicado && <Aviso tono="exito">Copia creada. Ajusta los datos que cambien y guarda.</Aviso>}
        {fabricanteNuevo && (
          <Aviso tono="info">
            Fabricante «{fabricanteNuevo.nombre}» creado y seleccionado abajo. Guarda los cambios para ligarlo a este producto.
          </Aviso>
        )}
        {!p.activo && <Aviso tono="aviso">Este producto está inactivo: no se ofrece al capturar solicitudes nuevas.</Aviso>}
        {registro.estado === "VENCIDO" && (
          <Aviso tono="peligro" titulo="Registro sanitario vencido">
            COFEPRIS no otorga el permiso con un registro vencido. Actualiza el número y la vigencia si ya tienes la prórroga.
          </Aviso>
        )}
        {registro.estado === "POR_VENCER" && (
          <Aviso tono="aviso" titulo="Registro sanitario por vencer">
            Vence el {formatoFecha(p.vigenciaRegistroSanitario)}. Considera tramitar la prórroga.
          </Aviso>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <Tarjeta titulo={puedeEditar ? "Editar datos" : "Datos"}>
          {puedeEditar && opciones ? (
            <FormularioProducto
              accion={guardarProducto.bind(null, p.id)}
              inicial={{
                denominacionEspecifica: p.denominacionEspecifica,
                denominacionDistintiva: p.denominacionDistintiva,
                denominacionComunCientifica: p.denominacionComunCientifica,
                idClasificacionProducto: p.idClasificacionProducto,
                idSubClasificacionProducto: p.idSubClasificacionProducto,
                idTipoProducto: p.idTipoProducto,
                especifique: p.especifique,
                idFormaFarmaceutica: p.idFormaFarmaceutica,
                idEstadoFisico: p.idEstadoFisico,
                fraccionArancelaria: p.fraccionArancelaria,
                descripcionFraccion: p.descripcionFraccion,
                umt: p.umt,
                umc: p.umc,
                desUMC: p.desUMC,
                presentacionTipoEnvase: p.presentacionTipoEnvase,
                numRegistroSanitario: p.numRegistroSanitario,
                vigenciaRegistroSanitario: fechaAInput(p.vigenciaRegistroSanitario),
                cvePaisOrigen: p.cvePaisOrigen,
                idUsoEspecifico: p.idUsoEspecifico,
                fabricanteId: fabricanteNuevo?.id ?? p.fabricanteId,
                notas: p.notas,
              }}
              opciones={opciones}
              rutaActual={`/productos/${p.id}`}
              textoBoton="Guardar cambios"
            />
          ) : (
            <Datos
              filas={[
                ["Denominación específica", p.denominacionEspecifica],
                ["Denominación distintiva (marca)", p.denominacionDistintiva],
                ["Denominación común o científica", p.denominacionComunCientifica],
                ["Clasificación", await describirClave("CAT_CLASIF_PRODUCTO", p.idClasificacionProducto)],
                ["Subclasificación", await describirClave("CAT_SUBCLASIF_PRODUCTO", p.idSubClasificacionProducto)],
                ["Tipo de producto", await describirClave("CAT_TIPO_PRODUCTO", p.idTipoProducto)],
                ["Especifique", p.especifique],
                ["Forma farmacéutica", await describirClave("CAT_FORMA_FARMACEUTICA", p.idFormaFarmaceutica)],
                ["Estado físico", await describirClave("CAT_ESTADO_FISICO", p.idEstadoFisico)],
                ["Fracción arancelaria", [p.fraccionArancelaria, p.descripcionFraccion].filter(Boolean).join(" · ")],
                ["UMT", await describirClave("CAT_UNIDAD_MEDIDA", p.umt)],
                ["UMC", await describirClave("CAT_UNIDAD_MEDIDA", p.umc)],
                ["Descripción UMC", p.desUMC],
                ["Presentación o tipo de envase", p.presentacionTipoEnvase],
                ["Registro sanitario", p.numRegistroSanitario],
                ["Vigencia del registro", formatoFecha(p.vigenciaRegistroSanitario)],
                ["País de origen", await describirClave("CAT_PAIS", p.cvePaisOrigen)],
                ["Uso específico", await describirClave("CAT_USO_ESPECIFICO", p.idUsoEspecifico)],
                [
                  "Fabricante",
                  p.fabricante ? (
                    <Link href={`/terceros/${p.fabricante.id}`} className="text-primario hover:underline">
                      {nombreTercero(p.fabricante)}
                    </Link>
                  ) : null,
                ],
                ["Notas", p.notas],
              ]}
            />
          )}
        </Tarjeta>

        <div className="space-y-6">
          {puedeEditar && (
            <Tarjeta titulo="Acciones">
              <div className="space-y-5">
                <BotonDuplicar accion={duplicarProducto.bind(null, p.id)} />
                <AccionesRegistro
                  activo={p.activo}
                  usos={usos}
                  nombre={p.denominacionEspecifica}
                  accionActivo={cambiarActivoProducto.bind(null, p.id)}
                  accionEliminar={eliminarProducto.bind(null, p.id)}
                  nota={p.documentos.length > 0 ? "Si lo eliminas, sus documentos se conservan pero quedan sin producto." : undefined}
                />
              </div>
            </Tarjeta>
          )}

          <Tarjeta titulo="Documentos" descripcion="Registro sanitario y sus modificaciones, marbetes, etc.">
            {!tieneDocumentoRegistro && (
              <div className="mb-3">
                <Aviso tono="aviso">Falta el registro sanitario digitalizado: es requisito por cada producto de la solicitud.</Aviso>
              </div>
            )}
            {p.documentos.length === 0 ? (
              <p className="text-sm text-texto-suave">Sin documentos ligados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.documentos.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documentos/${d.id}`} className="font-medium text-primario hover:underline">
                      {d.nombre}
                    </Link>
                    <span className="block text-xs text-texto-suave">
                      {ETIQUETA_TIPO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}
                      {d.vigenciaHasta && ` · vigente hasta ${formatoFecha(d.vigenciaHasta)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {puedeEditar && (
              <div className="mt-4">
                <EnlaceBoton href={hrefSubir} variante="secundario" tamano="sm">
                  Subir documento
                </EnlaceBoton>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Solicitudes donde se ha usado">
            {p.partidas.length === 0 ? (
              <p className="text-sm text-texto-suave">Aún no se usa en solicitudes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.partidas.map((pa) => (
                  <li key={pa.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Link href={`/solicitudes/${pa.solicitud.id}`} className="font-medium text-primario hover:underline">
                        Solicitud {pa.solicitud.numero}
                      </Link>
                      <span className="block text-xs text-texto-suave">
                        {pa.cantidadUMC} {pa.desUMC}
                      </span>
                    </span>
                    <Insignia>{ETIQUETA_ESTADO_SOLICITUD[pa.solicitud.estado as EstadoSolicitud] ?? pa.solicitud.estado}</Insignia>
                  </li>
                ))}
                {p._count.partidas > p.partidas.length && (
                  <li className="text-xs text-texto-suave">y {p._count.partidas - p.partidas.length} partidas más…</li>
                )}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
