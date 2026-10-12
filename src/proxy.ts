import { NextResponse, type NextRequest } from "next/server";

// Revisión ligera: sin cookie de sesión → /login. La validación real de la sesión
// (expiración, usuario activo, empresa) se hace en el servidor con obtenerContexto().
const RUTAS_PUBLICAS = ["/login", "/registro", "/api/vucem-simulador"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next();
  }
  if (!request.cookies.has("sesion")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
