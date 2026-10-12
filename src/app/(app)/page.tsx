import { EncabezadoPagina } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";

// Página temporal: el tablero se construye en el módulo de solicitudes.
export default async function Inicio() {
  const ctx = await obtenerContexto();
  return <EncabezadoPagina titulo={`Hola, ${ctx.usuario.nombre}`} descripcion="Tablero en construcción." />;
}
