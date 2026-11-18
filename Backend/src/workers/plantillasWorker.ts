// workers/plantillasWorker.ts
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PYTHON = path.resolve(__dirname, '../../scripts/parse_excel_tarifas.py');

const CHUNK_UPSERT = 500;
const PRECIO_MAX = 9_999_999_999.99;

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

async function ejecutarParser(
  rutaArchivoLocal: string,
  mapeoConfig: object
): Promise<RespuestaParserPython> {
  const idUnico = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mapeoPath = path.join(os.tmpdir(), `mapeo-${idUnico}.json`);
  const outputPath = path.join(os.tmpdir(), `output-${idUnico}.json`);
  
  await fs.promises.writeFile(mapeoPath, JSON.stringify(mapeoConfig), 'utf8');

  try {
    const args = [SCRIPT_PYTHON, '--file', rutaArchivoLocal, '--mapeo-file', mapeoPath, '--out-file', outputPath];
    const child = spawn('python3', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (buf: Buffer) => { stderr += buf.toString('utf8'); });

    const exitCode: number = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? -1));
    });

    if (exitCode !== 0) {
      const msg = stderr.trim().slice(0, 2000) || `Parser Python terminó con código ${exitCode}`;
      throw new Error(msg);
    }

    const resultadoBruto = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(resultadoBruto) as RespuestaParserPython;
    
    if (!parsed.success) {
      throw new Error(parsed.error ?? 'Parser Python reportó un error.');
    }
    
    return parsed;
  } finally {
    await fs.promises.rm(mapeoPath, { force: true }).catch(() => {});
    await fs.promises.rm(outputPath, { force: true }).catch(() => {});
  }
}

function identidad(item: ItemTarifaParseado): string {
  return JSON.stringify([item.magnitud, item.instrumento, item.norma, item.tipoServicio]);
}

async function persistirTarifas(
  tx: Prisma.TransactionClient,
  items: ItemTarifaParseado[]
): Promise<number> {
  if (items.length === 0) return 0;

  const MAGNITUD: string[] = [];
  const Instrumento: string[] = [];
  const Norma: string[] = [];
  const TIPO_SERVICIO: string[] = [];

  for (const item of items) {
    MAGNITUD.push(item.magnitud);
    Instrumento.push(item.instrumento);
    Norma.push(item.norma);
    TIPO_SERVICIO.push(item.tipoServicio);
  }

  // 1. Insertamos o actualizamos las tarifas maestras
  const tarifas = await tx.$queryRaw<
    { ID_TARIFA: number; MAGNITUD: string; Instrumento: string; Norma: string; TIPO_SERVICIO: string }[]
  >`
    INSERT INTO public.tarifas ("MAGNITUD", "Instrumento", "Norma", "TIPO_SERVICIO", "ESTADO")
    SELECT * FROM UNNEST(
      ${MAGNITUD}::text[],
      ${Instrumento}::text[],
      ${Norma}::text[],
      ${TIPO_SERVICIO}::text[],
      ARRAY_FILL('ACTIVO'::text, ARRAY[${items.length}]::int[])::text[]
    )
   ON CONFLICT ("MAGNITUD", "Instrumento", "Norma", "TIPO_SERVICIO")
   DO UPDATE SET "ESTADO" = 'ACTIVO'
    RETURNING "ID_TARIFA", "MAGNITUD", "Instrumento", "Norma", "TIPO_SERVICIO"
  `;

  const idPorIdentidad = new Map<string, number>();
  for (const t of tarifas) {
    idPorIdentidad.set(
      JSON.stringify([t.MAGNITUD, t.Instrumento, t.Norma, t.TIPO_SERVICIO]),
      t.ID_TARIFA
    );
  }

  const historial = new Map<string, { ID_TARIFA_FK: number; FECHA_INICIO: Date; FECHA_FIN: Date | null; PRECIO_U: number }>();

  // 2. Preparamos el historial de precios
  for (const item of items) {
    const idTarifa = idPorIdentidad.get(identidad(item));
    if (idTarifa === undefined) continue;

    const preciosOrdenados = [...item.preciosPorAnio].sort((a, b) => a.anio - b.anio);
    for (let i = 0; i < preciosOrdenados.length; i++) {
      const { anio, precio } = preciosOrdenados[i];
      if (typeof precio !== 'number' || Number.isNaN(precio) || precio < 0 || precio > PRECIO_MAX) {
        continue;
      }
      const fechaInicio = new Date(`${anio}-01-01T00:00:00.000Z`);
      let fechaFin: Date | null = null;
      if (i < preciosOrdenados.length - 1) {
        fechaFin = new Date(`${anio}-12-31T23:59:59.999Z`);
      }
      historial.set(`${idTarifa}:${anio}`, {
        ID_TARIFA_FK: idTarifa,
        FECHA_INICIO: fechaInicio,
        FECHA_FIN: fechaFin,
        PRECIO_U: Math.round(precio * 100) / 100,
      });
    }
  }

  const filas = [...historial.values()];
  let cambiosReales = 0;

  // 3. Upsert del historial con validación estricta de cambios
  for (let i = 0; i < filas.length; i += CHUNK_UPSERT) {
    const chunk = filas.slice(i, i + CHUNK_UPSERT);
    
    // Prisma captura el número de filas afectadas por la consulta
    const filasAfectadas = await tx.$executeRaw`
      INSERT INTO public.historial_tarifas ("ID_TARIFA_FK", "FECHA_INICIO", "FECHA_FIN", "PRECIO_U")
      SELECT * FROM UNNEST(
        ${chunk.map((r) => r.ID_TARIFA_FK)}::int[],
        ${chunk.map((r) => r.FECHA_INICIO.toISOString())}::text[]::timestamptz[],
        ${chunk.map((r) => r.FECHA_FIN ? r.FECHA_FIN.toISOString() : null)}::text[]::timestamptz[],
        ${chunk.map((r) => r.PRECIO_U)}::numeric(12,2)[]
      )
      ON CONFLICT ("ID_TARIFA_FK", "FECHA_INICIO")
      DO UPDATE SET
        "PRECIO_U" = EXCLUDED."PRECIO_U",
        "FECHA_FIN" = EXCLUDED."FECHA_FIN"
      WHERE public.historial_tarifas."PRECIO_U" != EXCLUDED."PRECIO_U"
         OR public.historial_tarifas."FECHA_FIN" IS DISTINCT FROM EXCLUDED."FECHA_FIN"
    `;

    cambiosReales += filasAfectadas;
  }

  return cambiosReales;
}

export async function procesarPlantillaJob(
  idVersion: number,
  rutaArchivoLocal: string,
  mapeoConfig: object
): Promise<string> { // 🔥 Ahora retorna un string
  const response = await ejecutarParser(rutaArchivoLocal, mapeoConfig);
  const items = response.data ?? [];
  
  // Retornamos el resultado de la transacción
  return await prisma.$transaction(
    async (tx) => {
      const cantidadCambios = await persistirTarifas(tx, items);
      
      const logMensaje = cantidadCambios === 0 
        ? "Procesado sin novedades. No se encontraron cambios en las tarifas." 
        : `Actualización exitosa. Se insertaron o modificaron ${cantidadCambios} registros.`;
        console.log(`Versión ${idVersion}: ${logMensaje}`);
const versionActualizada = await tx.version_plantillas.update({
        where: { ID_VERSION_PLANTILLA: idVersion },
        data: { ESTADO: 'COMPLETADO', PROCESADO_EN: new Date(), ERROR_LOG: logMensaje },
        select: { ID_USUARIO_CREADOR_FK: true } // 🔥 Pedimos que nos devuelva el ID del dueño
      });

      try {
        console.log(`Intentando notificar a Fastify sobre la finalización del job de plantilla (Versión ${idVersion})...`);
        await fetch('http://backend:3001/api/internal/emitir-socket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': 'SecretoInternoDocker123'
          },
          body: JSON.stringify({
            evento: 'job_plantilla_terminado',
            room: String(versionActualizada.ID_USUARIO_CREADOR_FK), // 🔥 ¡Aquí está la magia!
            payload: { 
               idVersion, 
               mensaje: logMensaje, 
               status: 'COMPLETADO' 
            }
          })
        });
      } catch (err) {
        console.error("Fallo al contactar a Fastify:", err);
      }

      return logMensaje; // 🔥 Devolvemos el mensaje hacia afuera
    },
    { timeout: 120000 }
  );
}