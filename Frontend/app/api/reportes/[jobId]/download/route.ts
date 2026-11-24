import { descargarArchivoReporte } from '../../descarga';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const query = new URL(request.url).searchParams;
  const formato = query.get('formato');
  const suffix = formato === 'pdf' || formato === 'excel' ? '?formato=' + formato : '';
  return descargarArchivoReporte(`/api/v1/reportes/job/${encodeURIComponent(jobId)}/download${suffix}`);
}
