import Link from "next/link";

import { Aviso, EncabezadoPagina, EnlaceBoton, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { mapaCatalogo } from "@/lib/catalogos";
import { db } from "@/lib/db";
import { faltaLicenciaOAviso } from "@/lib/validacion/establecimiento";

export default async function Establecimientos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const [establecimientos, entidades] = await Promise.all([
    db.establecimiento.findMany({
      where: { empresaId: ctx.empresa.id },
      include: { scian: { orderBy: { clave: "asc" }, select: { clave: true, descripcion: true } } },
      orderBy: [{ activo: "desc" }, { denominacionRazonSocial: "asc" }],
    }),
    mapaCatalogo("CAT_ENTIDAD"),
  ]);
  const puedeEditar = ctx.rol !== "CONSULTA";

  return (
    <>
      <EncabezadoPagina
        titulo="Establecimientos"
        descripcion="Almacenes o establecimientos con licencia sanitaria o aviso de funcionamiento. Se eligen en cada solicitud."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Establecimientos" }]}
        acciones={puedeEditar && <EnlaceBoton href="/establecimientos/nuevo">+ Nuevo establecimiento</EnlaceBoton>}
      />
      {sp.eliminado && (
        <div className="mb-4">
          <Aviso tono="exito">Establecimiento eliminado.</Aviso>
        </div>
      )}

      {establecimientos.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay establecimientos"
          descripcion="Da de alta el establecimiento que aparece en tu licencia sanitaria o aviso de funcionamiento para no capturarlo en cada solicitud."
          accion={puedeEditar && <EnlaceBoton href="/establecimientos/nuevo">Dar de alta establecimiento</EnlaceBoton>}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Denominación</Th>
              <Th>RFC resp. sanitario</Th>
              <Th>Municipio / entidad</Th>
              <Th>Licencia o aviso</Th>
              <Th>SCIAN</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {establecimientos.map((e) => (
              <tr key={e.id} className={e.activo ? undefined : "text-texto-suave"}>
                <Td>
                  <Link href={`/establecimientos/${e.id}`} className="font-medium text-primario hover:underline">
                    {e.denominacionRazonSocial}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">{e.rfcResponsableSanitario}</Td>
                <Td>
                  {e.municipio}
                  <span className="block text-xs text-texto-suave">{entidades.get(e.entidadFederativa) ?? e.entidadFederativa}</span>
                </Td>
                <Td>
                  {e.noLicenciaSanitaria ? (
                    <span>Licencia {e.noLicenciaSanitaria}</span>
                  ) : e.tieneAvisoFuncionamiento ? (
                    <span>Aviso de funcionamiento</span>
                  ) : null}
                  {faltaLicenciaOAviso(e) && <Insignia tono="aviso">Falta licencia o aviso</Insignia>}
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {e.scian.map((s) => (
                      <span key={s.clave} title={s.descripcion ?? undefined} className="font-mono text-xs">
                        {s.clave}
                      </span>
                    ))}
                  </span>
                </Td>
                <Td>{e.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
