import NextAuth from "next-auth";
import { authConfig } from "./app/Login/types/auth.config";

// La convención ahora es exportar 'proxy' en lugar de 'middleware'
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};