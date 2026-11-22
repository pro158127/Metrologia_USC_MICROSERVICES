import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { EmailJobData } from '../lib/queue/queue.js';

type CampoSecreto = 'codigo' | 'contrasenaTemporal' | 'nuevaContrasena';
type ControlesCorreo = Pick<EmailJobData, 'expira_en' | 'codigo_verificacion' | 'version_credencial'>;

function claveCorreo(): Buffer {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) throw new Error('Falta configurar la clave de protección de correos.');
  return createHmac('sha256', secreto).update('metrologia/contenido-correo/v1').digest();
}

export function protegerContenidoCorreo(campo: CampoSecreto, valor: string, controles: ControlesCorreo) {
  const nonce = randomBytes(12);
  const cifrado = createCipheriv('aes-256-gcm', claveCorreo(), nonce);
  cifrado.setAAD(Buffer.from(campo));
  const bytes = Buffer.concat([cifrado.update(valor, 'utf8'), cifrado.final()]);
  return {
    contenidoCorreoProtegido: { campo, cifrado: Buffer.concat([nonce, cifrado.getAuthTag(), bytes]).toString('base64') },
    controlesCorreo: controles,
  };
}

export function abrirContenidoCorreo(contexto: Record<string, unknown>): Record<string, unknown> {
  const protegido = contexto.contenidoCorreoProtegido as { campo: CampoSecreto; cifrado: string } | undefined;
  if (!protegido) return contexto; // Trabajos de Redis creados antes del cambio.
  const bytes = Buffer.from(protegido.cifrado, 'base64');
  const descifrado = createDecipheriv('aes-256-gcm', claveCorreo(), bytes.subarray(0, 12));
  descifrado.setAAD(Buffer.from(protegido.campo));
  descifrado.setAuthTag(bytes.subarray(12, 28));
  const texto = Buffer.concat([descifrado.update(bytes.subarray(28)), descifrado.final()]).toString('utf8');
  return { ...contexto, [protegido.campo]: texto };
}

export function controlesDeCorreo(contexto: unknown): ControlesCorreo {
  return (contexto as { controlesCorreo?: ControlesCorreo } | null)?.controlesCorreo ?? {};
}

export function limpiarContenidoCorreo(contexto: Record<string, unknown>): { CONTEXTO?: Prisma.InputJsonObject } {
  if (!contexto.contenidoCorreoProtegido) return {};
  const datos = { ...contexto };
  delete datos.contenidoCorreoProtegido;
  delete datos.controlesCorreo;
  return { CONTEXTO: datos as Prisma.InputJsonObject };
}
