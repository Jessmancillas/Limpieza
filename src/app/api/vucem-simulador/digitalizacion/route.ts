import { procesarDigitalizacion, respuestaHttp, simuladorHabilitado } from "@/lib/vucem/simulador";

// Simulador del servicio de Digitalización de Documentos de VUCEM (NO es VUCEM).
// Público (excluido del proxy de sesión): se autentica con el UsernameToken como el real.

export async function POST(request: Request) {
  if (!simuladorHabilitado()) return new Response("No encontrado", { status: 404 });
  const xml = await request.text();
  return respuestaHttp(procesarDigitalizacion(xml));
}
