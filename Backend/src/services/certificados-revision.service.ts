import type { Prisma } from '@prisma/client';
import { esAcreditado } from './certificatePdf.service.js';
import { vincularUnidadRecepcion } from './ot-fsm.service.js';

export async function obtenerBandejaRevision(db: Pick<Prisma.TransactionClient, 'certificados'>, idUsuario: number) {
      const certificados = await db.certificados.findMany({
        where: idUsuario
          ? { calibraciones: { ID_TECNICO_FK: { not: idUsuario } } }
          : {},
        include: {
          documentos: true,
          calibraciones: {
            include: {
              usuarios: true,
              recepcion_equipo_detalles: {
                include: {
                  recepciones_equipo: {
                    include: {
                      ordenes_trabajo: {
                        include: { clientes: true, orden_trabajo_detalles: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { ID_CERTIFICADO: 'desc' },
      });

      return certificados.map((cert) => {
        const cal = cert.calibraciones;
        const detalle = cal?.recepcion_equipo_detalles;
        const ot = detalle?.recepciones_equipo?.ordenes_trabajo ?? null;
        const otDetalle = detalle && ot ? vincularUnidadRecepcion(detalle,
          ot.orden_trabajo_detalles.filter((d) => d.activacion !== false)) : null;

        return {
          idCertificado: cert.ID_CERTIFICADO,
          codigo: cert.CODIGO_CERTIFICADO,
          estadoRevision: cert.ESTADO_REVISION,
          motivoRechazo: cert.MOTIVO_RECHAZO,
          idDocumento: cert.ID_DOCUMENTO_FK,
          rutaUrl: cert.documentos?.RUTA_URL ?? null,
          mimeType: cert.documentos?.MIME_TYPE ?? 'application/pdf',
          idPlantillaSello: cert.ID_PLANTILLA_SELLO_FK,
          idCalibracion: cert.ID_CALIBRACION_FK,
          idInstrumento: detalle?.ID_INSTRUMENTO ?? null,
          instrumento: detalle?.INSTRUMENTO ?? '—',
          estampilla: detalle?.ESTAMPILLA ?? '—',
          serie: detalle?.SERIE ?? null,
          marca: detalle?.MARCA ?? null,
          modelo: detalle?.MODELO ?? null,
          idOrdenTrabajo: ot?.ID_ORDEN_TRABAJO ?? null,
          codigoOT: ot?.CODIGO_OT ?? '—',
          cliente: ot?.clientes?.RAZON_SOCIAL ?? '—',
          tecnico: cal?.usuarios?.NOMBRE_COMPLETO ?? '—',
          tipoServicio: otDetalle?.TIPO_SERVICIO ?? null,
          datosTecnicos: cal?.DATOS_TECNICOS_JSON ?? null,
          createdAt: cal?.CREATED_AT ?? null,
          acreditado: esAcreditado(otDetalle?.TIPO_SERVICIO ?? null),
        };
      });
}
