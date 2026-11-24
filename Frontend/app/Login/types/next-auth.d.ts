import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  // 1. Estructura del objeto Session que usas con useSession() / auth()
  interface Session {
    // 👈 Elevamos accessToken a la raíz de Session para usar session.accessToken
    accessToken?: string;

    user: {
      id_user: number;
      role: string;
      permissions: { permisos: Record<string, Record<string, boolean>> };
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  // 2. Estructura del objeto User devuelto por tu Provider/Authorize
  interface User extends DefaultUser {
    id_user: number;
    role: string;
    permissions: { permisos: Record<string, Record<string, boolean>> };
    sessionVersion: number;
    accessToken?: string; // Opcional por si tu backend ya te entrega un token al hacer Login
  }
}

declare module "next-auth/jwt" {
  // 3. Estructura del payload del JWT de NextAuth
  interface JWT extends DefaultJWT {
    id_user: number;
    role: string;
    permissions: { permisos: Record<string, Record<string, boolean>> };
    sessionVersion: number;
    accessToken?: string; // 👈 Guardamos el token dentro de la payload codificada
  }
}
