import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import prisma from "@/app/lib/data_base/prisma" // Asegúrate de que la ruta sea correcta
import bcrypt from "bcryptjs" // Asegúrate de instalarlo: pnpm add bcryptjs @types/bcryptjs
import { authConfig } from "./auth.config"
import argon2 from 'argon2';
import { CredentialsSignin } from "next-auth"
import { crearNotificacion } from "@/app/action_module/notify"
import { obtenerIpCliente } from "@/app/action_module/administration"
import { Session } from "inspector/promises"
import { decode } from "next-auth/jwt"
import { encode } from "next-auth/jwt"


export class CustomAuthError extends CredentialsSignin {
  // En NextAuth v5, el string que le pases a super() 
  // o que asignes a 'code' es el que se enviará a la URL
  code: string

  constructor(code: string) {
    super(code) // Le pasamos el código al constructor padre
    this.code = code
    this.message = code
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
 
  secret: process.env.AUTH_SECRET,
   pages: {
    signIn: "/Login", // Define tu página de login personalizada
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const email = credentials.email as string
        const password = credentials.password as string
        console.log("Intentando autenticar al usuario:", email);


        const ip=await obtenerIpCliente()
        console.log(ip)
        // 1. Buscar usuario en tu DB
        const user = await prisma.usuario.findFirst({ where: {correo: email },
          include:{
            rol:{
              select:{
                nombreRol:true,
                permisos:true
              }
            }
        }})

       // Caso 1: Usuario no existe
        if (!user) {
          console.log("no se encontro usuario")
          throw new CustomAuthError("user_not_found")
        }

        // Caso 2: Usuario bloqueado por exceder intentos
        if (user.intentos >= 3 || user.estado === false) {
          // Aseguramos que quede desactivado en DB
    
          throw new CustomAuthError("user_blocked_or_inactive")
        }

        const passwordMatch = await argon2.verify(user.contraseña, password);
        console.log("esta acaaaa")
        if (!passwordMatch) {
          const nuevosIntentos = user.intentos + 1  
          console.log(nuevosIntentos)
          if (nuevosIntentos == 3) {  
                 await prisma.usuario.update({
        where: { idUsuario: user.idUsuario },
        data: { intentos: nuevosIntentos, estado: false }
      });
              await crearNotificacion({idUsuario:1,mensaje:`La cuenta del usuario ${user.correo } ha sido bloqueada tras 5 intentos fallidos de contraseña. IP de origen: ${ip}`,modulo:"Sistema",nivelPrioridad:"ALTA"})
            throw new CustomAuthError("user_blocked_now") // Se bloqueó justo en este intento
          } else {
             await prisma.usuario.update({
        where: { idUsuario: user.idUsuario },
        data: { intentos: nuevosIntentos }
      });
            throw new CustomAuthError("invalid_credentials")
          }
        }

        // Si todo sale bien, reseteamos intentos y devolvemos el usuario
        if (user.intentos > 0) {
         await prisma.usuario.update({
        where: { idUsuario: user.idUsuario },
        data: { intentos:0 }
      });
        }

        // 3. Retornar el usuario (esto crea la sesión)
        return { id_user: user.idUsuario, name: user.nombreCompleto, email: user.correo, role: user.rol.nombreRol ,permissions: user.rol.permisos}
      },
    }),
  ],

  session: {
    strategy: "jwt", // Es más eficiente para inactividad
    maxAge: 30 * 60, // 30 minutos en segundos (30 * 60 = 1800)
    updateAge: 5 * 60, // Actualiza la sesión cada 5 minutos
  },
  
  callbacks: {
async jwt({ token, user }) {
      if (user) {
        // EL ERROR VIENE DE AQUÍ: Estás consultando la DB en cada petición JWT.
        // En lugar de volver a consultar a Prisma, usa los datos que ya vienen en 'user'
        token.role = user.role;
        token.permissions = user.permissions;
        token.id_user = user.id_user; // Asegúrate de que 'id_user' esté en el objeto 'user'
        token.name = user.name; // Asegúrate de que 'name' esté en el objeto 'user'

      }
      return token;
    },
   async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as any;
        session.user.id_user = token.id_user as any;
        session.user.name = token.name as any;
        session.user.permissions = token.permissions as string; // <--- Disponibles aquí
        session.accessToken=token.accessToken
        const secret=process.env.AUTH_SECRET;
        if(secret){
          session.accessToken= await encode({token,secret,salt:"authjs.session-token",});
        }
      }
      return session;
    }
  }
})