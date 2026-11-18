import NextAuth from "next-auth";
import { authConfig } from "./app/Login/types/auth.config";
import { NextResponse } from "next/server";

// Exportamos tu 'proxy' como lo tenías
export const { auth: proxy } = NextAuth(authConfig);

// Envolvemos el proxy para inyectar los headers antes de que Next.js valide las Server Actions
export default proxy((req) => {
  const requestHeaders = new Headers(req.headers);
  const origin = requestHeaders.get('origin');

  // Si hay un origin, forzamos el x-forwarded-host a ser idéntico
  if (origin) {
    const originDomain = origin.replace(/^https?:\/\//, '');
    requestHeaders.set('x-forwarded-host', originDomain);
  }

  // Devolvemos la petición para que continúe su camino, pero con los headers modificados
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
matcher: ["/((?!api|_next/static|_next/image|favicon.ico|socket.io).*)"],
  
};