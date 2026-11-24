import { descargarArchivoReporte } from '../../../descarga';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ numeroFactura: string }> }) {
  const { numeroFactura } = await context.params;
  return descargarArchivoReporte(`/api/v1/reportes/facturas/${encodeURIComponent(numeroFactura)}/download`);
}
