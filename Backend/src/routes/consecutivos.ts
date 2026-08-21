import { FastifyInstance } from 'fastify';

interface GenerarConsecutivoBody {
  tipo: string;
  codigoBaseExistente?: string;
}

function obtenerSiguienteLetra(letraActual: string): string {
  const charCode = letraActual.charCodeAt(0);
  if (charCode >= 90) {
    throw new Error('Se ha alcanzado el límite máximo de versiones permitidas (Z).');
  }
  return String.fromCharCode(charCode + 1);
}

export default async function consecutivosRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: GenerarConsecutivoBody }>(
    '/api/v1/consecutivos',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { tipo, codigoBaseExistente } = request.body;
        const yearSuffix = new Date().getFullYear().toString().slice(-2);
        const prefijoAnno = `${tipo}-${yearSuffix}-`;

        const codigo = await fastify.prisma.$transaction(async (tx) => {
          if (codigoBaseExistente) {
            const match = codigoBaseExistente.match(/^([A-Z]+-\d{2}-\d{4})([A-Z])$/);
            if (!match) {
              throw new Error(
                'El código base proporcionado no cumple con el formato requerido (PRE-AA-XXXXZ).'
              );
            }

            const [, raiz, letraActual] = match;
            const siguienteLetra = obtenerSiguienteLetra(letraActual);
            return `${raiz}${siguienteLetra}`;
          }

          let ultimoCodigo: string | null = null;

          if (tipo === 'COT') {
            const ult = await tx.cotizaciones.findFirst({
              where: { CODIGO_COTIZACION: { startsWith: prefijoAnno } },
              orderBy: { CODIGO_COTIZACION: 'desc' },
              select: { CODIGO_COTIZACION: true },
            });
            ultimoCodigo = ult?.CODIGO_COTIZACION ?? null;
          } else if (tipo === 'OT') {
            const ult = await tx.ordenes_trabajo.findFirst({
              where: { CODIGO_OT: { startsWith: prefijoAnno } },
              orderBy: { CODIGO_OT: 'desc' },
              select: { CODIGO_OT: true },
            });
            ultimoCodigo = ult?.CODIGO_OT ?? null;
          } else if (tipo === 'REC') {
            const ult = await tx.recepciones_equipo.findFirst({
              where: { CODIGO_RECEPCION: { startsWith: prefijoAnno } },
              orderBy: { CODIGO_RECEPCION: 'desc' },
              select: { CODIGO_RECEPCION: true },
            });
            ultimoCodigo = ult?.CODIGO_RECEPCION ?? null;
          }

          if (!ultimoCodigo) {
            return `${prefijoAnno}0001A`;
          }

          const matchNumero = ultimoCodigo.match(/^[A-Z]+-\d{2}-(\d{4})[A-Z]$/);
          const numeroSecuencial = matchNumero ? parseInt(matchNumero[1], 10) + 1 : 1;
          const numeroFormateado = numeroSecuencial.toString().padStart(4, '0');

          return `${prefijoAnno}${numeroFormateado}A`;
        });

        return { codigo };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error
            ? error.message
            : 'Error interno del servidor al generar el consecutivo';

        if (message.includes('formato requerido') || message.includes('límite máximo')) {
          return reply.code(400).send({ error: message });
        }

        return reply.code(500).send({ error: message });
      }
    }
  );
}
