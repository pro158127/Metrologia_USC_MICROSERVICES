import crypto from 'crypto';

const PURPOSE = 'aprobar_cotizacion';
const DEFAULT_TTL_SEG = 30 * 24 * 60 * 60; // 30 días

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET no está definido en el entorno');
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Firma un token de aprobación de cotización (HMAC-SHA256 con AUTH_SECRET).
 * El token es autocontenido (JWT-like) y no requiere almacenarse en BD.
 */
export function firmarTokenAprobacion(
  cotizacionId: number,
  expiraEnSeg: number = DEFAULT_TTL_SEG
): string {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(cotizacionId),
    purpose: PURPOSE,
    iat: ahora,
    exp: ahora + expiraEnSeg,
  };

  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export interface TokenAprobacion {
  cotizacionId: number;
}

/**
 * Verifica un token de aprobación y devuelve el id de la cotización si es válido.
 * Devuelve `null` si el token es inválido, expiró o tiene otro propósito.
 */
export function verificarTokenAprobacion(token: string): TokenAprobacion | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = crypto
      .createHmac('sha256', getSecret())
      .update(signingInput)
      .digest('base64url');

    const firmaRecibida = Buffer.from(signature);
    const firmaEsperada = Buffer.from(expected);
    if (
      firmaRecibida.length !== firmaEsperada.length ||
      !crypto.timingSafeEqual(firmaRecibida, firmaEsperada)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );

    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
      return null;
    }

    const cotizacionId = Number(payload.sub);
    if (!Number.isInteger(cotizacionId) || cotizacionId <= 0) return null;

    return { cotizacionId };
  } catch {
    return null;
  }
}
