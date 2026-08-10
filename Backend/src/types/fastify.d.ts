import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
// Estructura de permisos según tu lógica de NestJS
export interface PermisosModulo {
  administracion?: {
    consultar_bitacora_auditoria?: boolean;
    [key: string]: boolean | undefined;
  };
  [key: string]: Record<string, boolean | undefined> | undefined;
}

// Payload real que NextAuth firma en el JWT
export interface NextAuthJWTPayload {
  sub: string; // ID del usuario en formato estándar JWT (Subject)
  email: string;
  name?: string;
  role?: string;
  permissions?: {
    permisos?: PermisosModulo;
  };
  // Propiedades opcionales si colocaste todo dentro de user en NextAuth
  user?: {
    id: string;
    email: string;
    nombreCompleto?: string;
    permissions?: {
      permisos?: PermisosModulo;
    };
  };
  iat?: number;
  exp?: number;
  jti?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: NextAuthJWTPayload;
    user: NextAuthJWTPayload;
  }
}