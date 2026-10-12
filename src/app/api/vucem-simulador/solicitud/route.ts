import { atenderPeticion, procesarSolicitud } from "@/lib/vucem/simulador";

// Simulador del WS 260211 (NO es VUCEM; el folio que responde no es oficial).
// Público (excluido del proxy de sesión): se autentica con el UsernameToken como el real.
// Deshabilitado (404) en producción salvo VUCEM_SIMULADOR=true.

export async function POST(request: Request) {
  return atenderPeticion(request, (xml) => procesarSolicitud(xml));
}
