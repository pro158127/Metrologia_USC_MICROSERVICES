import type { FastifyInstance } from 'fastify';
import { obtenerBandejaRevision } from '../services/certificados-revision.service.js';
import { cotizacionRawToDtoSchema } from './cotizaciones.schemas.js';
import { ordenTrabajoRawToDtoSchema, clienteRawToDtoSchema } from './ordenes.schemas.js';
import { certificadoRawToDtoSchema } from './certificados.schemas.js';
import { facturaRawToDtoSchema } from './facturas.schemas.js';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/v1/dashboard/snapshot', { preHandler: [app.authenticate] }, async (request) => {
    const permisos = request.user?.user?.permissions?.permisos?.revision;
    const acreditados = Boolean(permisos?.revisar_aprobar_acreditados);
    const noAcreditados = Boolean(permisos?.revisar_aprobar_no_acreditados);
    return app.prisma.$transaction(async (tx) => {
      const [reloj] = await tx.$queryRaw<{ generatedAt: Date }[]>`SELECT transaction_timestamp() AS "generatedAt"`;
      const cotizaciones = await tx.cotizaciones.findMany({
        include: { clientes: true, historial_estado_cotizacion: true }, orderBy: { CREATED_AT: 'desc' },
      });
      const ordenes = await tx.ordenes_trabajo.findMany({
        include: { clientes: true, cotizaciones: { include: { clientes: true } }, orden_trabajo_detalles: true },
        orderBy: { CREATED_AT: 'desc' },
      });
      const certificados = await tx.certificados.findMany({ include: { certificado_sellos: true } });
      const facturas = await tx.facturas.findMany({ include: { clientes: true, ordenes_trabajo: { include: { clientes: true } } }, orderBy: { FECHA: 'desc' } });
      const clientes = await tx.clientes.findMany();
      const bandeja = acreditados || noAcreditados ? await obtenerBandejaRevision(tx, Number(request.user?.sub ?? 0)) : [];
      return {
        generatedAt: reloj.generatedAt,
        cotizaciones: cotizaciones.map((c) => cotizacionRawToDtoSchema.parse(c)),
        ordenes: ordenes.map((o) => ordenTrabajoRawToDtoSchema.parse(o)),
        certificados: certificados.map((c) => certificadoRawToDtoSchema.parse(c)),
        facturas: facturas.map((f) => facturaRawToDtoSchema.parse(f)),
        clientes: clientes.map((c) => clienteRawToDtoSchema.parse(c)),
        metricas: cotizaciones.map((c) => ({
          estado: c.ESTADO,
          emitidaAt: c.historial_estado_cotizacion.filter((h) => h.ESTADO_NUEVO === 'ENVIADA').sort((a,b) => a.CREATED_AT.getTime()-b.CREATED_AT.getTime())[0]?.CREATED_AT ?? (c.ESTADO !== 'BORRADOR' ? c.CREATED_AT : null),
          aprobadaAt: c.historial_estado_cotizacion.filter((h) => h.ESTADO_NUEVO === 'APROBADA').sort((a,b) => a.CREATED_AT.getTime()-b.CREATED_AT.getTime())[0]?.CREATED_AT ?? null,
        })),
        bandeja: bandeja.filter((c) => c.acreditado ? acreditados : noAcreditados),
      };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  });
}
