// ==========================================
// FUNCIONES DE NORMALIZACIÓN (SIN CAMBIOS)
// Extraídas de app/componets/tables_recharge.tsx para compartirlas
// entre el store (dbstore) y el handler realtime sin import circular.
// ==========================================

export const obtenerLlavePrimaria = (tabla: string, data: unknown): { nombreLlave: string; idValor: number } => {
  const dataMapeada = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  switch (tabla) {
    case 'usuarios':                  return { nombreLlave: 'idUsuario', idValor: Number(dataMapeada.idUsuario) };
    case 'tarifas':                   return { nombreLlave: 'idTarifa', idValor: Number(dataMapeada.idTarifa) };
    case 'notificaciones':            return { nombreLlave: 'idNotificacion', idValor: Number(dataMapeada.idNotificacion) };
    case 'roles':                     return { nombreLlave: 'idRol', idValor: Number(dataMapeada.idRol) };
    case 'audit_logs':                return { nombreLlave: 'id', idValor: Number(dataMapeada.id) };
    case 'clientes':                  return { nombreLlave: 'idCliente', idValor: Number(dataMapeada.idCliente) };
    case 'cotizaciones':              return { nombreLlave: 'idCotizacion', idValor: Number(dataMapeada.idCotizacion) };
    case 'cotizacion_detalles':       return { nombreLlave: 'idDetalle', idValor: Number(dataMapeada.idDetalle) };
    case 'ordenes_trabajo':           return { nombreLlave: 'idOrdenTrabajo', idValor: Number(dataMapeada.idOrdenTrabajo) };
    case 'orden_trabajo_detalles':    return { nombreLlave: 'idDetalle', idValor: Number(dataMapeada.idDetalle) };
    case 'recepciones_equipo':     return { nombreLlave: 'idRecepcion', idValor: Number(dataMapeada.idRecepcion) };
    case 'recepcion_equipo_detalles': return { nombreLlave: 'idInstrumento', idValor: Number(dataMapeada.idInstrumento) };
    case 'documentos':             return { nombreLlave: 'idDocumento', idValor: Number(dataMapeada.idDocumento) };
    case 'version_documentos':     return { nombreLlave: 'idVersion', idValor: Number(dataMapeada.idVersion) };
    case 'calibraciones':          return { nombreLlave: 'idCalibracion', idValor: Number(dataMapeada.idCalibracion) };
    case 'certificados':           return { nombreLlave: 'idCertificado', idValor: Number(dataMapeada.idCertificado) };
    case 'certificado_sellos':     return { nombreLlave: 'idCertificado', idValor: Number(dataMapeada.idCertificado) };
    case 'document_chunks':        return { nombreLlave: 'idChunk', idValor: Number(dataMapeada.idChunk) };
    case 'historial_estado_cotizacion': return { nombreLlave: 'id', idValor: Number(dataMapeada.id) };
    case 'historial_tarifas':      return { nombreLlave: 'idHistorial', idValor: Number(dataMapeada.idHistorial) };
    case 'parametros_sistema':     return { nombreLlave: 'idParametro', idValor: Number(dataMapeada.idParametro) };
    case 'sellos':                 return { nombreLlave: 'idSello', idValor: Number(dataMapeada.idSello) };
    case 'tramites':               return { nombreLlave: 'idTramite', idValor: Number(dataMapeada.idTramite) };
    case 'version_plantillas':     return { nombreLlave: 'idVersionPlantilla', idValor: Number(dataMapeada.idVersionPlantilla) };
    case 'facturas':               return { nombreLlave: 'idFactura', idValor: Number(dataMapeada.idFactura) };
    case 'seguimientos_comerciales': return { nombreLlave: 'idSeguimiento', idValor: Number(dataMapeada.idSeguimiento) };
   case 'plantillas_sellos':
      return {
        // El nombre con el que se guarda en el estado de React/Zustand:
        nombreLlave: 'idPlantillaSello',
        // Buscamos tanto en camelCase (normalizado) como en UPPERCASE (crudo):
        idValor: Number(dataMapeada.idPlantillaSello ?? dataMapeada.ID_PLANTILLA_SELLO ?? dataMapeada.id)
      };
    default:                          return { nombreLlave: 'id', idValor: Number(dataMapeada.id) };

  }
};
