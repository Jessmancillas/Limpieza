import { procesarSolicitud, respuestaHttp, simuladorHabilitado } from "@/lib/vucem/simulador";

// Simulador del WS 260211 (NO es VUCEM; el folio que responde no es oficial).
// Público (excluido del proxy de sesión): se autentica con el UsernameToken como el real.

export async function POST(request: Request) {
  if (!simuladorHabilitado()) return new Response("No encontrado", { status: 404 });
  const xml = await request.text();
  return respuestaHttp(procesarSolicitud(xml));
}
