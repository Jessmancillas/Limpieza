import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, Datos, EncabezadoPagina, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { describirClave, obtenerOpcionesCatalogo } from "@/lib/catalogos";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_TERCERO,
  type EstadoSolicitud,
  type TipoTercero,
} from "@/lib/constantes";
import { db } from "@/lib/db";
import { nombreTercero } from "@/lib/validacion/tercero";

import { AccionesRegistro } from "../../establecimientos/_compartido/acciones-registro";
import { plural } from "../../establecimientos/_compartido/servidor";
import { cambiarActivoTercero, eliminarTercero, guardarTercero } from "../acciones";
import { FormularioTercero } from "../formulario";

export default async function DetalleTercero({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const t = await db.tercero.findFirst({
    where: { id, empresaId },
    include: {
      solicitudes: {
        where: { solicitud: { empresaId } },
        select: { id: true, rol: true, solicitud: { select: { id: true, numero: true, estado: true } } },
        orderBy: { id: "desc" },
        take: 20,
      },
      productosFabricados: {
        where: { empresaId },
        select: { id: true, denominacionEspecifica: true, denominacionDistintiva: true, activo: true },
        orderBy: { denominacionEspecifica: "asc" },
        take: 50,
      },
      _count: { select: { solicitudes: true, productosFabricados: true } },
    },
  });
  if (!t) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const nombre = nombreTercero(t);
  const tipo = t.tipo as TipoTercero;
  const [opcionesPais, opcionesEntidad] = await Promise.all([
    obtenerOpcionesCatalogo("CAT_PAIS"),
    obtenerOpcionesCatalogo("CAT_ENTIDAD"),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo={nombre}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Insignia tono="primario">{ETIQUETA_TIPO_TERCERO[tipo] ?? t.tipo}</Insignia>
            <Insignia>{t.tipoPersona === "FISICA" ? "Persona física" : "Persona moral"}</Insignia>
            <Insignia>{t.nacionalidad === "NACIONAL" ? "Nacional" : "Extranjero"}</Insignia>
            {t.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
          </span>
        }
        migas={[
          { etiqueta: "Terceros", href: "/terceros" },
          { etiqueta: ETIQUETA_TIPO_TERCERO[tipo] ?? t.tipo, href: `/terceros?tipo=${t.tipo}` },
          { etiqueta: nombre },
        ]}
      />

      <div className="space-y-4">
        {sp.creado && <Aviso tono="exito">Tercero creado.</Aviso>}
        {!t.activo && <Aviso tono="aviso">Este tercero está inactivo: no se ofrece en productos ni solicitudes nuevas.</Aviso>}
        {t._count.solicitudes > 0 && puedeEditar && (
          <Aviso tono="info">
            Está ligado a {plural(t._count.solicitudes, "solicitud", "solicitudes")}. Los cambios se reflejan en las solicitudes que aún no
            se presentan.
          </Aviso>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <Tarjeta titulo={puedeEditar ? "Editar datos" : "Datos"}>
          {puedeEditar ? (
            <FormularioTercero
              accion={guardarTercero.bind(null, t.id)}
              inicial={{
                tipo: t.tipo,
                tipoPersona: t.tipoPersona,
                nacionalidad: t.nacionalidad,
                nombre: t.nombre,
                apellidoPaterno: t.apellidoPaterno,
                apellidoMaterno: t.apellidoMaterno,
                denominacionRazonSocial: t.denominacionRazonSocial,
                rfc: t.rfc,
                curp: t.curp,
                correoElectronico: t.correoElectronico,
                pais: t.pais,
                entidadFederativa: t.entidadFederativa,
                municipio: t.municipio,
                colonia: t.colonia,
                localidad: t.localidad,
                codigoPostal: t.codigoPostal,
                calle: t.calle,
                numeroExterior: t.numeroExterior,
                numeroInterior: t.numeroInterior,
                lada: t.lada,
                telefono: t.telefono,
              }}
              opcionesPais={opcionesPais}
              opcionesEntidad={opcionesEntidad}
              cancelarHref={`/terceros?tipo=${t.tipo}`}
              textoBoton="Guardar cambios"
            />
          ) : (
            <Datos
              filas={[
                ["Nombre o razón social", nombre],
                ["RFC", t.rfc],
                ["CURP", t.curp],
                ["Correo electrónico", t.correoElectronico],
                ["País", await describirClave("CAT_PAIS", t.pais)],
                [
                  "Entidad federativa",
                  t.nacionalidad === "NACIONAL" ? await describirClave("CAT_ENTIDAD", t.entidadFederativa) : t.entidadFederativa,
                ],
                ["Municipio", t.municipio],
                ["Colonia", t.colonia],
                ["Localidad", t.localidad],
                ["Código postal", t.codigoPostal],
                ["Calle y número", [t.calle, t.numeroExterior, t.numeroInterior && `int. ${t.numeroInterior}`].filter(Boolean).join(" ")],
                ["Teléfono", [t.lada && `(${t.lada})`, t.telefono].filter(Boolean).join(" ") || null],
              ]}
            />
          )}
        </Tarjeta>

        <div className="space-y-6">
          {puedeEditar && (
            <Tarjeta titulo="Estado">
              <AccionesRegistro
                activo={t.activo}
                usos={t._count.solicitudes}
                nombre={nombre}
                accionActivo={cambiarActivoTercero.bind(null, t.id)}
                accionEliminar={eliminarTercero.bind(null, t.id)}
                nota={
                  t._count.productosFabricados > 0
                    ? `Es fabricante de ${plural(t._count.productosFabricados, "producto", "productos")}; si lo eliminas quedarán sin fabricante.`
                    : undefined
                }
              />
            </Tarjeta>
          )}

          {(t.tipo === "FABRICANTE" || t.productosFabricados.length > 0) && (
            <Tarjeta titulo="Productos que fabrica">
              {t.productosFabricados.length === 0 ? (
                <p className="text-sm text-texto-suave">Ningún producto lo tiene como fabricante.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {t.productosFabricados.map((p) => (
                    <li key={p.id}>
                      <Link href={`/productos/${p.id}`} className="font-medium text-primario hover:underline">
                        {p.denominacionEspecifica}
                      </Link>
                      <span className="block text-xs text-texto-suave">
                        {p.denominacionDistintiva}
                        {!p.activo && " · inactivo"}
                      </span>
                    </li>
                  ))}
                  {t._count.productosFabricados > t.productosFabricados.length && (
                    <li className="text-xs text-texto-suave">y {t._count.productosFabricados - t.productosFabricados.length} más…</li>
                  )}
                </ul>
              )}
            </Tarjeta>
          )}

          <Tarjeta titulo="Solicitudes">
            {t.solicitudes.length === 0 ? (
              <p className="text-sm text-texto-suave">Aún no se usa en solicitudes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {t.solicitudes.map((st) => (
                  <li key={st.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Link href={`/solicitudes/${st.solicitud.id}`} className="font-medium text-primario hover:underline">
                        Solicitud {st.solicitud.numero}
                      </Link>
                      <span className="block text-xs text-texto-suave">
                        Como {(ETIQUETA_TIPO_TERCERO[st.rol as TipoTercero] ?? st.rol).toLowerCase()}
                      </span>
                    </span>
                    <Insignia>{ETIQUETA_ESTADO_SOLICITUD[st.solicitud.estado as EstadoSolicitud] ?? st.solicitud.estado}</Insignia>
                  </li>
                ))}
                {t._count.solicitudes > t.solicitudes.length && (
                  <li className="text-xs text-texto-suave">y {t._count.solicitudes - t.solicitudes.length} más…</li>
                )}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
