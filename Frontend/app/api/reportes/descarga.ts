import { auth } from '@/app/Login/types/auth';
import { fastifyFetch } from '@/app/lib/api/fastifyClient';

export async function descargarArchivoReporte(path: string) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }
  const response = await fastifyFetch(session, path, {}, 'no-store');
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    return Response.json(
      { error: body.error ?? body.message ?? 'No se pudo descargar el archivo.' },
      { status: response.status },
    );
  }
  const headers = new Headers({
    'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
    'Cache-Control': 'private, no-store',
  });
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) headers.set('Content-Disposition', disposition);
  return new Response(response.body, { status: 200, headers });
}
