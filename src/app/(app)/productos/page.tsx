import Link from "next/link";

import { Aviso, clasesBoton, EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { mapaCatalogo } from "@/lib/catalogos";
import { db } from "@/lib/db";
import { estadoRegistroSanitario } from "@/lib/validacion/producto";
import { nombreTercero } from "@/lib/validacion/tercero";

import { InsigniaRegistro } from "./insignia-registro";

export default async function Productos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim().slice(0, 100);
  const empresaId = ctx.empresa.id;

  const [productos, paises] = await Promise.all([
    db.producto.findMany({
      where: {
        empresaId,
        ...(q
          ? {
              OR: [
                { denominacionEspecifica: { contains: q } },
                { denominacionDistintiva: { contains: q } },
                { denominacionComunCientifica: { contains: q } },
                { fraccionArancelaria: { contains: q } },
                { numRegistroSanitario: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        fabricante: {
          select: { tipoPersona: true, nombre: true, apellidoPaterno: true, apellidoMaterno: true, denominacionRazonSocial: true },
        },
      },
      orderBy: [{ activo: "desc" }, { denominacionEspecifica: "asc" }],
    }),
    mapaCatalogo("CAT_PAIS"),
  ]);
  const puedeEditar = ctx.rol !== "CONSULTA";
  const hoy = new Date();
  const porAtender = productos.filter((p) => {
    const e = estadoRegistroSanitario(p, hoy).estado;
    return p.activo && (e === "VENCIDO" || e === "POR_VENCER");
  }).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Productos"
        descripcion="Dispositivos médicos que importas. Captúralos una vez y elígelos como mercancía en cada solicitud."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Productos" }]}
        acciones={puedeEditar && <EnlaceBoton href="/productos/nuevo">+ Nuevo producto</EnlaceBoton>}
      />
      <div className="mb-4 space-y-3">
        {sp.eliminado && <Aviso tono="exito">Producto eliminado.</Aviso>}
        {porAtender > 0 && !q && (
          <Aviso tono="aviso">
            {porAtender} producto{porAtender === 1 ? " tiene" : "s tienen"} el registro sanitario vencido o por vencer en 90 días o
            menos.
          </Aviso>
        )}
      </div>

      <form action="/productos" role="search" className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar producto
        </label>
        <Entrada
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Denominación, marca, fracción o registro sanitario"
          className="w-full sm:w-96"
        />
        <button type="submit" className={clasesBoton("secundario")}>
          Buscar
        </button>
        {q && (
          <Link href="/productos" className={clasesBoton("fantasma")}>
            Limpiar
          </Link>
        )}
      </form>

      {productos.length === 0 ? (
        <EstadoVacio
          titulo={q ? "Sin resultados" : "Aún no hay productos"}
          descripcion={
            q
              ? `No hay productos que coincidan con «${q}».`
              : "Da de alta los dispositivos médicos con su fracción arancelaria, registro sanitario y fabricante para reutilizarlos en tus solicitudes."
          }
          accion={puedeEditar && !q && <EnlaceBoton href="/productos/nuevo">Dar de alta producto</EnlaceBoton>}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Producto</Th>
              <Th>Fracción</Th>
              <Th>Registro sanitario</Th>
              <Th>Fabricante</Th>
              <Th>Origen</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {productos.map((p) => (
              <tr key={p.id} className={p.activo ? undefined : "text-texto-suave"}>
                <Td>
                  <Link href={`/productos/${p.id}`} className="font-medium text-primario hover:underline">
                    {p.denominacionEspecifica}
                  </Link>
                  <span className="block text-xs text-texto-suave">{p.denominacionDistintiva}</span>
                </Td>
                <Td className="font-mono text-xs">{p.fraccionArancelaria}</Td>
                <Td>
                  {p.numRegistroSanitario && <span className="block font-mono text-xs">{p.numRegistroSanitario}</span>}
                  <InsigniaRegistro
                    numRegistroSanitario={p.numRegistroSanitario}
                    vigenciaRegistroSanitario={p.vigenciaRegistroSanitario}
                    hoy={hoy}
                  />
                </Td>
                <Td>{p.fabricante ? nombreTercero(p.fabricante) : "—"}</Td>
                <Td>{p.cvePaisOrigen ? (paises.get(p.cvePaisOrigen) ?? p.cvePaisOrigen) : "—"}</Td>
                <Td>{p.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
