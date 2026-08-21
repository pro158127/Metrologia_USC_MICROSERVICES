import { FastifyInstance } from 'fastify';

interface DocumentoDTO {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
  proveedor: string;
  mimeType: string;
}

interface VersionActualDTO {
  idVersionPlantilla: number;
  version: number;
  mapeoExcelJson: unknown;
  createdAt: Date;
  documento: DocumentoDTO | null;
}

interface PlantillaConDocumentoDTO {
  idPlantilla: number;
  nombre: string;
  modulo: string;
  activa: boolean;
  versionActual: VersionActualDTO | null;
}

interface VersionCompletaDTO {
  idVersionPlantilla: number;
  idPlantilla: number;
  version: number;
  mapeoExcelJson: unknown;
  createdby: { nombre: string };
  createdAt: Date;
  iddocumentos: number | null;
  documento: (DocumentoDTO & { createdAt: Date }) | null;
}

interface PlantillaCompletaDTO {
  idPlantilla: number;
  nombre: string;
  modulo: string;
  activa: boolean;
  versiones: VersionCompletaDTO[];
}

function serializeDocumento(row: Record<string, any>): DocumentoDTO {
  return {
    idDocumento: row.ID_DOCUMENTO,
    nombre: row.NOMBRE,
    rutaUrl: row.RUTA_URL,
    proveedor: row.PROVEEDOR,
    mimeType: row.MIME_TYPE,
  };
}

export default async function plantillasRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/v1/plantillas/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const idPlantilla = Number(request.params.id);

        if (!request.params.id || Number.isNaN(idPlantilla) || idPlantilla <= 0) {
          return {
            success: false,
            error: 'El idPlantilla es requerido y debe ser un número válido.',
          };
        }

        const version = request.query.version ? Number(request.query.version) : undefined;

        const plantilla = await fastify.prisma.plantillas.findUnique({
          where: { ID_PLANTILLA: idPlantilla },
          include: {
            version_plantillas: {
              where: version ? { VERSION: version } : undefined,
              orderBy: { VERSION: 'desc' },
              take: 1,
              include: {
                documentos: true,
              },
            },
          },
        });

        if (!plantilla) {
          return {
            success: false,
            error: `No se encontró la plantilla con el ID: ${idPlantilla}`,
          };
        }

        const versionEncontrada = plantilla.version_plantillas[0] ?? null;

        const data: PlantillaConDocumentoDTO = {
          idPlantilla: plantilla.ID_PLANTILLA,
          nombre: plantilla.NOMBRE,
          modulo: plantilla.MODULO,
          activa: plantilla.ACTIVA,
          versionActual: versionEncontrada
            ? {
                idVersionPlantilla: versionEncontrada.ID_VERSION_PLANTILLA,
                version: versionEncontrada.VERSION,
                mapeoExcelJson: versionEncontrada.MAPEO_EXCEL_JSON ?? null,
                createdAt: versionEncontrada.CREATED_AT,
                documento: versionEncontrada.documentos
                  ? serializeDocumento(versionEncontrada.documentos)
                  : null,
              }
            : null,
        };

        return { success: true, data };
      } catch (error) {
        request.log.error(error);
        return {
          success: false,
          error: 'Error interno del servidor al consultar la plantilla.',
        };
      }
    }
  );

  fastify.get(
    '/api/v1/plantillas',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const plantillas = await fastify.prisma.plantillas.findMany({
          orderBy: { ID_PLANTILLA: 'desc' },
          include: {
            version_plantillas: {
              orderBy: { VERSION: 'desc' },
              include: {
                documentos: true,
                usuarios: {
                  select: { NOMBRE_COMPLETO: true },
                },
              },
            },
          },
        });

        const data: PlantillaCompletaDTO[] = plantillas.map((p) => ({
          idPlantilla: p.ID_PLANTILLA,
          nombre: p.NOMBRE,
          modulo: p.MODULO,
          activa: p.ACTIVA,
          versiones: p.version_plantillas.map((v) => ({
            idVersionPlantilla: v.ID_VERSION_PLANTILLA,
            idPlantilla: v.ID_PLANTILLA_FK,
            version: v.VERSION,
            mapeoExcelJson: v.MAPEO_EXCEL_JSON ?? null,
            createdby: { nombre: v.usuarios?.NOMBRE_COMPLETO || '' },
            createdAt: v.CREATED_AT,
            iddocumentos: v.ID_DOCUMENTOS_FK ?? null,
            documento: v.documentos
              ? { ...serializeDocumento(v.documentos), createdAt: v.documentos.CREATED_AT }
              : null,
          })),
        }));

        return { success: true, data };
      } catch (error) {
        request.log.error(error);
        return {
          success: false,
          error: 'Error interno al obtener la totalidad de plantillas y sus documentos.',
        };
      }
    }
  );
}
