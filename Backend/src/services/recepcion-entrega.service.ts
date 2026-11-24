import { AppError } from '../lib/errors.js';

type EstadoIbcLike = {
  salida?: Record<string, unknown>;
} | null | undefined;

export interface RecepcionSalidaLike {
  fechaSalida?: unknown;
  nombreRecibe?: string | null;
  nombreEmpaca?: string | null;
  accesorios?: string | null;
  nombreRecibeServicio?: string | null;
  instrumentos: Array<{
    instrumento?: string | null;
    estadoIBC?: EstadoIbcLike;
    activacion?: boolean | null;
  }>;
}

/** Datos de salida pendientes. Son informativos para Entrega y Envío; no bloquean el correo. */
export function pendientesEntregaSalida(recepcion: RecepcionSalidaLike): string[] {
  const faltantes = new Set<string>();
  const equipos = recepcion.instrumentos.filter((equipo) => equipo.activacion !== false);

  if (!recepcion.fechaSalida) faltantes.add('fecha de salida');
  if (!recepcion.nombreRecibe?.trim()) faltantes.add('nombre de quien recibe');
  if (!recepcion.nombreEmpaca?.trim()) faltantes.add('nombre de quien empaca');
  if (!/^Accesorios: (Bueno|Malo) -\s*\S/i.test(recepcion.accesorios ?? '')) {
    faltantes.add('accesorios y estado general');
  }
  if (!recepcion.nombreRecibeServicio?.trim()) faltantes.add('nombre de quien recibe el servicio');
  if (equipos.length === 0) faltantes.add('instrumentos activos en la recepción');

  for (const equipo of equipos) {
    const salida = equipo.estadoIBC?.salida;
    if (!['E', 'T', 'D', 'A'].every((clave) => typeof salida?.[clave] === 'boolean')) {
      faltantes.add(`estado IBC de salida de ${equipo.instrumento ?? 'instrumento'}`);
    }
  }

  return [...faltantes];
}

interface InstrumentoEstadoRecepcion {
  instrumento: string;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  codigoInventario?: string | null;
  resolucion?: string | null;
  estadoIBC?: unknown;
}

function validarRecepcionDefinitiva(body: InstrumentoEstadoRecepcion[], cabecera: { fechaRecepcion?: string | null }) {
  return Boolean(
    cabecera.fechaRecepcion && body.length > 0 &&
    body.every((inst) => {
      const entrada = (inst.estadoIBC as { entrada?: Record<string, unknown> } | null)?.entrada;
      return [inst.instrumento, inst.marca, inst.modelo, inst.serie, inst.codigoInventario, inst.resolucion]
        .every((v) => v != null && String(v).trim() !== '') &&
        ['E', 'T', 'D', 'A'].every((k) => typeof entrada?.[k] === 'boolean');
    })
  );
}

export function calcularEstadoRecepcion(
  instrumentos: InstrumentoEstadoRecepcion[],
  cabecera: {
    estado?: string;
    nombreEntrega?: string | null;
    fechaRecepcion?: string | null;
    fechaSalida?: string | null;
    nombreRecibe?: string | null;
    nombreEmpaca?: string | null;
    accesorios?: string | null;
    nombreRecibeServicio?: string | null;
  },
  nombreRecibeSesion: string,
): 'BORRADOR' | 'RECIBIDO' | 'ENTREGADO' {
  const entradaCompleta = validarRecepcionDefinitiva(instrumentos, cabecera);
  const pendientesSalida = pendientesEntregaSalida({
    fechaSalida: cabecera.fechaSalida,
    nombreRecibe: nombreRecibeSesion || cabecera.nombreRecibe,
    nombreEmpaca: cabecera.nombreEmpaca,
    accesorios: cabecera.accesorios,
    nombreRecibeServicio: cabecera.nombreRecibeServicio,
    instrumentos: instrumentos.map((instrumento) => ({
      instrumento: instrumento.instrumento,
      estadoIBC: instrumento.estadoIBC as { salida?: Record<string, unknown> } | null,
      activacion: true,
    })),
  });
  const salidaCompleta = entradaCompleta && pendientesSalida.length === 0;

  if (cabecera.estado === 'ENTREGADO' && !salidaCompleta) {
    throw new AppError(409, 'No se puede cerrar la recepción: faltan datos de salida de uno o más instrumentos.');
  }
  if (cabecera.estado === 'RECIBIDO' && !entradaCompleta) {
    throw new AppError(409, 'No se puede marcar RECIBIDO: complete datos de entrada de todos los instrumentos.');
  }

  if (!entradaCompleta) return 'BORRADOR';
  return salidaCompleta ? 'ENTREGADO' : 'RECIBIDO';
}
