import { NextRequest, NextResponse } from "next/server"

/**
 * Guard liviano: solo chequea que exista la cookie de sesión antes de
 * renderizar rutas protegidas, para evitar el flash de contenido privado.
 * La autorización real (¿el token es válido? ¿tiene el permiso?) la hace
 * siempre el backend en cada request — este middleware corre en el Edge
 * Runtime de Next, que no puede verificar la firma del JWT con las mismas
 * libs que usa Fastify. Nunca confiar en esta capa como única barrera.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("access_token")
  const { pathname } = request.nextUrl

  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/proyectos")

  if (isProtected && !hasSession) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/proyectos/:path*"],
}
