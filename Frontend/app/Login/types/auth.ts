import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "./auth.config"
import { CredentialsSignin } from "next-auth"
import { obtenerIpCliente } from "@/app/action_module/administration"
import { encode } from "next-auth/jwt"
import { BASE_URL } from "@/app/lib/api/fastifyClient"

export class CustomAuthError extends CredentialsSignin {
  code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.message = code
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/Login",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const email = credentials.email as string
        const password = credentials.password as string
        const ip = await obtenerIpCliente()

        const res = await fetch(`${BASE_URL}/api/v1/auth/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, ip }),
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new CustomAuthError((data as { code?: string })?.code ?? "invalid_credentials")
        }

        return data.user
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 60,
    updateAge: 5 * 60,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.permissions = user.permissions;
        token.id_user = user.id_user;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id_user = token.id_user;
        session.user.name = token.name;
        session.user.permissions = token.permissions as string;
        session.accessToken = token.accessToken
        const secret = process.env.AUTH_SECRET;
        if (secret) {
          session.accessToken = await encode({ token, secret, salt: "authjs.session-token" });
        }
      }
      return session;
    }
  }
})
