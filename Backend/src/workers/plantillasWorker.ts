// workers/plantillasWorker.ts
// Pipeline dinámico de tarifas: ejecuta el parser Python y persiste el resultado
// de forma atómica (prisma.$transaction) en `tarifas` e `historial_tarifas`.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PYTHON = path.resolve(
  __dirname,
  '../../scripts/parse_excel_tarifas.py'
);

export interface PrecioPorAnio {
  anio: number;
  precio: number;
}

export interface ItemTarifaParseado {
  magnitud: string;
  instrumento: string;
  norma: string;
  tipoServicio: string;
  preciosPorAnio: PrecioPorAnio[];
}

export interface RespuestaParserPython {
  success: boolean;
  data: ItemTarifaParseado[];
  error?: string;
}

export async function procesarPlantillaJob(
  idVersion: number,
  rutaArchivoLocal: string,
  mapeoConfig: object
) {
  // 1. Ejecutar el script Python
  const command = `python3 "${SCRIPT_PYTHON}" --file "${rutaArchivoLocal}" --mapeo '${JSON.stringify(
    mapeoConfig
  )}'`;
  const { stdout } = await execPromise(command, { maxBuffer: 50 * 1024 * 1024 });
  const response: RespuestaParserPython = JSON.parse(stdout);

  if (!response.success) {
    throw new Error(`Error en parser Python: ${response.error}`);
  }

  const items = response.data;

  // 2. Persistencia en Base de Datos con prisma.$transaction
  await prisma.$transaction(
    async (tx) => {
      for (const item of items) {
        // A. Upsert en la tabla principal 'tarifas' usando la restricción única compuesta
        const tarifa = await tx.tarifas.upsert({
          where: {
            UQ_tarifa_identidad: {
              MAGNITUD: item.magnitud,
              Instrumento: item.instrumento,
              Norma: item.norma,
              TIPO_SERVICIO: item.tipoServicio,
            },
          },
          update: { ESTADO: 'ACTIVO' },
          create: {
            MAGNITUD: item.magnitud,
            Instrumento: item.instrumento,
            Norma: item.norma,
            TIPO_SERVICIO: item.tipoServicio,
            ESTADO: 'ACTIVO',
          },
        });

        // Ordenar los precios por año ascendente para procesar el historial cronológicamente
        const preciosOrdenados = item.preciosPorAnio.sort(
          (a: any, b: any) => a.anio - b.anio
        );

        for (let i = 0; i < preciosOrdenados.length; i++) {
          const { anio, precio } = preciosOrdenados[i];
          const fechaInicio = new Date(`${anio}-01-01T00:00:00.000Z`);

          // Determinar la fecha de fin: si hay un año siguiente, la vigencia cierra el 31 de dic de ese año
          let fechaFin: Date | null = null;
          if (i < preciosOrdenados.length - 1) {
            fechaFin = new Date(`${anio}-12-31T23:59:59.999Z`);
          }

          // B. Upsert del registro histórico del precio
          await tx.historial_tarifas.upsert({
            where: {
              UQ_tarifa_fecha_inicio: {
                ID_TARIFA_FK: tarifa.ID_TARIFA,
                FECHA_INICIO: fechaInicio,
              },
            },
            update: {
              PRECIO_U: precio,
              FECHA_FIN: fechaFin,
            },
            create: {
              ID_TARIFA_FK: tarifa.ID_TARIFA,
              FECHA_INICIO: fechaInicio,
              FECHA_FIN: fechaFin,
              PRECIO_U: precio,
            },
          });
        }
      }

      // C. Actualizar estado de la versión
      await tx.version_plantillas.update({
        where: { ID_VERSION_PLANTILLA: idVersion },
        data: {
          ESTADO: 'COMPLETADO',
          PROCESADO_EN: new Date(),
        },
      });
    },
    {
      timeout: 30000, // Ajustar según volumen de tarifas
    }
  );
}
