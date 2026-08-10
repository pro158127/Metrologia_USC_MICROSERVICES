import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // Los proveedores reales van en auth.ts (el archivo del lado del servidor)
  pages: {
    signIn: "/Login", // Define tu página de login personalizada
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      console.log("Usuario logueado:", isLoggedIn, "Ruta solicitada:", nextUrl.pathname);
      // Define aquí tus rutas protegidas (ejemplo: todo lo que empieza por /dashboard o /admin)
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard") || 
                           nextUrl.pathname.startsWith("/admin");

      if (isOnDashboard) {
        if (isLoggedIn) return true; // Usuario logueado: dejar pasar
        return false; // Usuario no logueado: redirigir a login (gracias a pages.signIn)
      } 
      
      // Si el usuario está logueado y trata de ir al login, enviarlo al dashboard
      if (isLoggedIn && nextUrl.pathname === "/Login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true; // Permitir el acceso a otras rutas públicas (como /)
    },
  },
} satisfies NextAuthConfig;