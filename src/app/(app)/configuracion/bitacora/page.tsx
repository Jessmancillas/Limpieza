import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, EncabezadoPagina, EstadoVacio, Insignia, Selector, Tabla, Td, Th, clasesBoton } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";

import { resumirDetalle } from "./resumen";

export const metadata: Metadata = { title: "Bitácora" };

const LIMITE = 200;

const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

const TONO_ACCION: Record<string, "exito" | "info" | "peligro" | "aviso" | "neutro"> = {
  CREAR: "exito",
  CREAR_USUARIO: "exito",
  AGREGAR_MIEMBRO: "exito",
  REGISTRO: "exito",
  ACTUALIZAR: "info",
  CAMBIAR_ROL: "info",
  IMPORTAR: "info",
  ELIMINAR: "peligro",
  QUITAR_MIEMBRO: "peligro",
  CAMBIAR_CONTRASENA: "aviso",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaBitacora({ searchParams }: Props) {
  const ctx = await obtenerContexto();
  const migas = [{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Configuración" }, { etiqueta: "Bitácora" }];

  if (ctx.rol !== "ADMIN") {
    return (
      <>
        <EncabezadoPagina titulo="Bitácora" migas={migas} />
        <Aviso tono="info">Solo un administrador de la empresa puede consultar la bitácora.</Aviso>
      </>
    );
  }

  const sp = await searchParams;
  const empresaId = ctx.empresa.id;
  const [porAccion, porEntidad] = await Promise.all([
    db.bitacora.groupBy({ by: ["accion"], where: { empresaId }, orderBy: { accion: "asc" } }),
    db.bitacora.groupBy({ by: ["entidad"], where: { empresaId }, orderBy: { entidad: "asc" } }),
  ]);
  const acciones = porAccion.map((g) => g.accion);
  const entidades = porEntidad.map((g) => g.entidad);
  // Solo se aceptan valores que existen en la bitácora de la empresa.
  const accion = acciones.includes(texto(sp.accion)) ? texto(sp.accion) : "";
  const entidad = entidades.includes(texto(sp.entidad)) ? texto(sp.entidad) : "";

  const entradas = await db.bitacora.findMany({
    where: { empresaId, ...(accion ? { accion } : {}), ...(entidad ? { entidad } : {}) },
    orderBy: { creadoEn: "desc" },
    take: LIMITE,
  });

  const idsUsuario = [...new Set(entradas.map((e) => e.usuarioId).filter((id): id is string => Boolean(id)))];
  const usuarios = new Map(
    (await db.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true, email: true } })).map(
      (u) => [u.id, u],
    ),
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Bitácora"
        descripcion={`Últimos ${LIMITE} movimientos registrados en la empresa: altas, cambios, bajas, importaciones y accesos. No se registran contraseñas ni llaves.`}
        migas={migas}
      />

      <div className="space-y-4">
        <form method="get" action="/configuracion/bitacora" className="flex flex-wrap items-end gap-3">
          <div className="basis-56">
            <label htmlFor="accion" className="block text-sm font-medium">
              Acción
            </label>
            <Selector id="accion" name="accion" defaultValue={accion} className="mt-1">
              <option value="">Todas</option>
              {acciones.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Selector>
          </div>
          <div className="basis-56">
            <label htmlFor="entidad" className="block text-sm font-medium">
              Entidad
            </label>
            <Selector id="entidad" name="entidad" defaultValue={entidad} className="mt-1">
              <option value="">Todas</option>
              {entidades.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Selector>
          </div>
          <button type="submit" className={clasesBoton("secundario")}>
            Filtrar
          </button>
          {(accion || entidad) && (
            <Link href="/configuracion/bitacora" className="py-2 text-sm text-primario hover:underline">
              Quitar filtros
            </Link>
          )}
        </form>

        {entradas.length === 0 ? (
          <EstadoVacio titulo="Sin movimientos" descripcion={accion || entidad ? "No hay movimientos con esos filtros." : undefined} />
        ) : (
          <>
            <p className="text-sm text-texto-suave">
              {entradas.length === LIMITE ? `Se muestran los ${LIMITE} más recientes.` : `${entradas.length} movimientos.`}
            </p>
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Usuario</Th>
                  <Th>Acción</Th>
                  <Th>Entidad</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {entradas.map((e) => {
                  const u = e.usuarioId ? usuarios.get(e.usuarioId) : undefined;
                  const resumen = resumirDetalle(e.detalle);
                  return (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap tabular-nums">{formatoFechaHora.format(e.creadoEn)}</Td>
                      <Td>
                        {u ? (
                          <>
                            <span className="block">{u.nombre}</span>
                            <span className="block text-xs break-all text-texto-suave">{u.email}</span>
                          </>
                        ) : e.usuarioId ? (
                          <span className="text-texto-suave">Usuario eliminado</span>
                        ) : (
                          <span className="text-texto-suave">Sistema</span>
                        )}
                      </Td>
                      <Td>
                        <Insignia tono={TONO_ACCION[e.accion] ?? "neutro"}>{e.accion}</Insignia>
                      </Td>
                      <Td>
                        <span className="block">{e.entidad}</span>
                        {e.entidadId && <span className="block font-mono text-xs break-all text-texto-suave">{e.entidadId}</span>}
                      </Td>
                      <Td className="max-w-md text-xs break-words text-texto-suave">
                        <span title={resumirDetalle(e.detalle, 2000)}>{resumen || "—"}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </>
        )}
      </div>
    </>
  );
}
