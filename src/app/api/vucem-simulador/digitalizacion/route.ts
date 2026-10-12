import { atenderPeticion, procesarDigitalizacion } from "@/lib/vucem/simulador";

// Simulador del servicio de Digitalización de Documentos de VUCEM (NO es VUCEM).
// Público (excluido del proxy de sesión): se autentica con el UsernameToken como el real.
// Deshabilitado (404) en producción salvo VUCEM_SIMULADOR=true.

export async function POST(request: Request) {
  return atenderPeticion(request, (xml) => procesarDigitalizacion(xml));
}
