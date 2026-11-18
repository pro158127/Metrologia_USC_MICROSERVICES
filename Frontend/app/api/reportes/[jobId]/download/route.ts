import { auth } from '@/app/Login/types/auth';
import { BASE_URL } from '@/app/lib/api/fastifyClient';
import { generarTokenBackend } from '@/app/lib/auth-token';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const id = session.user.id_user ?? session.user.id ?? '';
  const token = await generarTokenBackend({
    sub: String(id),
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role ?? '',
    user: {
      id: String(id),
      email: session.user.email ?? '',
      nombreCompleto: session.user.name ?? '',
      permissions: { permisos: session.user.permissions?.permisos ?? {} },
    },
  });

  const { jobId } = await context.params;
  const response = await fetch(
    `${BASE_URL}/api/v1/reportes/job/${encodeURIComponent(jobId)}/download`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    return Response.json(
      { error: body.error ?? body.message ?? 'No se pudo descargar el reporte.' },
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
