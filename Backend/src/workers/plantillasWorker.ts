// workers/plantillasWorker.ts
// Pipeline dinámico de tarifas: ejecuta el parser Python (vía spawn, sin shell)
// y persiste el resultado de forma atómica y por lotes (prisma.$transaction +
// UNNEST/ON CONFLICT) en `tarifas` e `historial_tarifas`.
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PYTHON = path.resolve(__dirname, '../../scripts/parse_excel_tarifas.py');

const MAX_STDOUT_BYTES = 256 * 1024 * 1024;
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
  const mapeoPath = path.join(os.tmpdir(), `mapeo-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await fs.promises.writeFile(mapeoPath, JSON.stringify(mapeoConfig), 'utf8');

  try {
    const args = [SCRIPT_PYTHON, '--file', rutaArchivoLocal, '--mapeo-file', mapeoPath];
    const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let errores = false;

    const onData = (buf: Buffer, acc: { valor: string; abierto: boolean }) => {
      acc.valor += buf.toString('utf8');
      if (acc.valor.length > MAX_STDOUT_BYTES) {
        acc.abierto = false;
        child.kill();
      }
    };

    const stdoutAcc = { valor: '', abierto: true };
    const stderrAcc = { valor: '', abierto: true };
    child.stdout.on('data', (buf: Buffer) => onData(buf, stdoutAcc));
    child.stderr.on('data', (buf: Buffer) => onData(buf, stderrAcc));

    const exitCode: number = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? -1));
    });

    stdout = stdoutAcc.valor;
    stderr = stderrAcc.valor;

    if (exitCode !== 0) {
      errores = true;
      const msg = stderr.trim().slice(0, 2000) || `Parser Python terminó con código ${exitCode}`;
      throw new Error(msg);
    }
    if (!stdout.trim()) {
      throw new Error('Parser Python no emitió resultados.');
    }

    const parsed = JSON.parse(stdout) as RespuestaParserPython;
    if (!parsed.success) {
      throw new Error(parsed.error ?? 'Parser Python reportó un error.');
    }
    return parsed;
  } finally {
    await fs.promises.rm(mapeoPath, { force: true });
  }
}

function identidad(item: ItemTarifaParseado): string {
  return JSON.stringify([item.magnitud, item.instrumento, item.norma, item.tipoServicio]);
}

async function persistirTarifas(
  tx: Prisma.TransactionClient,
  items: ItemTarifaParseado[]
): Promise<void> {
  if (items.length === 0) return;

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
    ON CONFLICT ON CONSTRAINT "UQ_tarifa_identidad"
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
  for (let i = 0; i < filas.length; i += CHUNK_UPSERT) {
    const chunk = filas.slice(i, i + CHUNK_UPSERT);
    await tx.$executeRaw`
      INSERT INTO public.historial_tarifas ("ID_TARIFA_FK", "FECHA_INICIO", "FECHA_FIN", "PRECIO_U")
      SELECT * FROM UNNEST(
        ${chunk.map((r) => r.ID_TARIFA_FK)}::int[],
        ${chunk.map((r) => r.FECHA_INICIO)}::timestamptz[],
        ${chunk.map((r) => r.FECHA_FIN)}::timestamptz[],
        ${chunk.map((r) => r.PRECIO_U)}::numeric(12,2)[]
      )
      ON CONFLICT ON CONSTRAINT "UQ_tarifa_fecha_inicio"
      DO UPDATE SET
        "PRECIO_U" = EXCLUDED."PRECIO_U",
        "FECHA_FIN" = EXCLUDED."FECHA_FIN"
    `;
  }
}

export async function procesarPlantillaJob(
  idVersion: number,
  rutaArchivoLocal: string,
  mapeoConfig: object
): Promise<void> {
  const response = await ejecutarParser(rutaArchivoLocal, mapeoConfig);
  const items = response.data ?? [];

  await prisma.$transaction(
    async (tx) => {
      await persistirTarifas(tx, items);
      await tx.version_plantillas.update({
        where: { ID_VERSION_PLANTILLA: idVersion },
        data: {
          ESTADO: 'COMPLETADO',
          PROCESADO_EN: new Date(),
        },
      });
    },
    {
      timeout: 60000,
    }
  );
}
