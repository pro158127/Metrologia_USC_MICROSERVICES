import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { generarConsecutivo } from './consecutivo.service.js';
import { vincularUnidadRecepcion } from './ot-fsm.service.js';
import { sincronizarOTMaestraDesdeRecepcion } from './recepcion-ot-sync.service.js';
import { siguienteVersionOT } from './versionado-ot.service.js';
import type { InstrumentoResuelto } from './ot-split.service.js';

type Tx = Prisma.TransactionClient;
type Referencia = { id: number; codigo: string; esNueva: boolean };

const comparable = (valor: unknown) => JSON.stringify(valor ?? null);

function camposInstrumento(inst: InstrumentoResuelto) {
  return {
    FABRICANTE: inst.fabricante || null, MODELO: inst.modelo || null,
    SERIE: inst.serie || null, CODIGO_INVENTARIO: inst.codigo_interno || null,
    UBICACION: inst.ubicacion || null, PUNTOS_CALIBRAR: inst.puntos_calibracion ?? [],
    UNIDAD: inst.unidad || null, INTERVALO_RANGO: inst.intervalo_medicion || null,
    RESOLUCION: inst.resolucion_division || null, DECLARACION_CONFORMIDAD: inst.declaracion_conformidad ?? false,
    LIMITE_CONTROL_EMC: inst.emp_ajuste_control || inst.emp_limite_control || null,
    DOC_ESPECIFICACION: inst.documento_especificacion || null, REGLA_DECISION: inst.regla_decision || null,
  };
}

export async function reimportarFamiliaOTVersionada(tx: Tx, input: {
  idCotizacion: number;
  idCliente: number | null;
  idUsuario: number;
  datosOT: Record<string, unknown>;
  instrumentosResueltos: InstrumentoResuelto[];
  solicitante: string;
}): Promise<{ cambio: boolean; cambioTabular: boolean; ots: Referencia[]; recepciones: Referencia[] }> {
  await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${input.idCotizacion} FOR UPDATE`;
  const familia = await tx.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: input.idCotizacion, VIGENTE: true },
    include: {
      orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } },
      recepciones_equipo: {
        where: { VIGENTE: true, activacion: true },
        orderBy: [{ VERSION: 'desc' }, { ID_RECEPCION: 'desc' }],
        take: 1,
        include: { recepcion_equipo_detalles: {
          where: { OR: [{ activacion: true }, { activacion: null }] },
          include: { calibraciones: { select: { ID_CALIBRACION: true } } },
        } },
      },
    },
  });
  const padres = new Set(familia.map((ot) => ot.ID_OT_PADRE_FK));
  const operativas = familia.filter((ot) => !padres.has(ot.ID_ORDEN_TRABAJO));
  const ids = input.instrumentosResueltos.map((inst) => inst.idUnidad);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length ||
      operativas.reduce((total, ot) => total + ot.orden_trabajo_detalles.length, 0) !== ids.length) {
    throw new AppError(409, 'La importación no coincide con las unidades vigentes. Revisa los equipos en Recepciones.');
  }

  const ots: Referencia[] = [];
  const recepciones: Referencia[] = [];
  const usadas = new Set<string>();
  const maestras = new Set<number>();
  let cambioTabular = false;
  const { no_orden_trabajo: _codigoAnterior, no_cotizacion: _cotizacionAnterior,
    ES_INTERNO_USC: _interno, HORA_CALIBRACION, ...camposCabecera } = input.datosOT;
  const cabecera = { ...camposCabecera, ...(HORA_CALIBRACION !== undefined ? { hora: HORA_CALIBRACION, HORA_CALIBRACION } : {}) };

  for (const ot of operativas) {
    if (ot.estado === 'Certificado_enviado') {
      throw new AppError(409, 'La OT ya tiene certificados enviados. No se puede reimportar.');
    }
    const recepcion = ot.recepciones_equipo[0];
    const recibidos = recepcion?.recepcion_equipo_detalles ?? [];
    const sitio = ot.SITIO_CALIBRACION ?? recepcion?.SITIO_CALIBRACION ?? 'LABORATORIO';
    const entrantes = input.instrumentosResueltos.filter((inst) => inst.sitio === sitio);
    let cambioOT = false;
    let cambioRecepcion = false;
    for (const unidad of ot.orden_trabajo_detalles) {
      const inst = entrantes.find((fila) => fila.idUnidad === unidad.ID_UNIDAD_FK);
      if (!inst?.idUnidad || usadas.has(inst.idUnidad)) {
        throw new AppError(409, 'El Excel no identifica una unidad vigente de la OT en su sitio.');
      }
      usadas.add(inst.idUnidad);
      const recibido = vincularUnidadRecepcion(unidad, recibidos);
      if (!recibido) throw new AppError(409, 'La OT tiene una unidad sin recepción vinculada. Regulariza la recepción.');
      const campos = camposInstrumento(inst);
      const compartidos = {
        MARCA: campos.FABRICANTE, MODELO: campos.MODELO, SERIE: campos.SERIE,
        CODIGO_INVENTARIO: campos.CODIGO_INVENTARIO, RESOLUCION: campos.RESOLUCION,
      };
      for (const [clave, valor] of Object.entries(compartidos)) {
        const previo = recibido[clave as keyof typeof compartidos];
        if (previo != null && previo !== valor) {
          throw new AppError(409, `Corrige "${unidad.INSTRUMENTO}" desde Recepciones: el Excel difiere de los datos recibidos.`);
        }
      }
      const cambioDetalle = Object.entries(campos).some(([clave, valor]) => comparable(unidad[clave as keyof typeof campos]) !== comparable(valor));
      const cambioEnRecepcion = Object.entries(compartidos).some(([clave, valor]) => recibido[clave as keyof typeof compartidos] !== valor);
      if ((cambioDetalle || cambioEnRecepcion) && recibido.calibraciones) {
        throw new AppError(409, `"${unidad.INSTRUMENTO}" ya inició calibración. Conserva el instrumento y sus datos técnicos.`);
      }
      if (cambioDetalle) {
        await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: unidad.ID_DETALLE }, data: campos });
        cambioOT = true;
        cambioTabular = true;
      }
      if (cambioEnRecepcion) {
        await tx.recepcion_equipo_detalles.update({ where: { ID_INSTRUMENTO: recibido.ID_INSTRUMENTO }, data: compartidos });
        cambioRecepcion = true;
        cambioTabular = true;
      }
    }

    const cambiaCabecera = Object.entries(cabecera).some(([clave, valor]) => comparable(Reflect.get(ot, clave)) !== comparable(valor));
    if (cambioOT || cambiaCabecera) {
      const version = await siguienteVersionOT(tx, ot);
      await tx.ordenes_trabajo.update({ where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO }, data: { ...cabecera, ...version } });
      ots.push({ id: ot.ID_ORDEN_TRABAJO, codigo: version.CODIGO_OT, esNueva: false });
      if (cambioOT && ot.ID_OT_PADRE_FK) maestras.add(ot.ID_OT_PADRE_FK);
    }
    if (cambioRecepcion && recepcion) {
      const codigo = await generarConsecutivo(tx, 'REC', recepcion.CODIGO_RECEPCION);
      await tx.recepciones_equipo.update({ where: { ID_RECEPCION: recepcion.ID_RECEPCION }, data: { CODIGO_RECEPCION: codigo } });
      recepciones.push({ id: recepcion.ID_RECEPCION, codigo, esNueva: false });
    }
  }
  for (const id of maestras) {
    if (await sincronizarOTMaestraDesdeRecepcion(tx, id)) {
      const maestra = await tx.ordenes_trabajo.findUniqueOrThrow({ where: { ID_ORDEN_TRABAJO: id } });
      ots.push({ id, codigo: maestra.CODIGO_OT, esNueva: false });
    }
  }
  return { cambio: ots.length + recepciones.length > 0, cambioTabular, ots, recepciones };
}
