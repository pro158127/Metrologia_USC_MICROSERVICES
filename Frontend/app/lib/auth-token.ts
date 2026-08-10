'use server';
import { SignJWT } from 'jose';

export async function generarTokenBackend(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  
  // Genera un JWS firmado válido para @fastify/jwt
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}