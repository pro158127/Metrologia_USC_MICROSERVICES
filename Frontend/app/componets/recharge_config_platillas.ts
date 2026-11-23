type TablaPlantillas = "plantillas" | "version_plantilla" | "version_plantillas" | "documentos_plantillas";
type Operacion = "INSERT" | "UPDATE" | "DELETE";

interface EventoRealtimePayload {
  tabla: TablaPlantillas;
  operacion: Operacion;
  // payload con los campos de la tabla afectada
  data: {
    ID_PLANTILLA?: number; idPlantilla?: number; MODULO?: string; modulo?: string;
    ACTIVA?: boolean; activa?: boolean; NOMBRE?: string; nombre?: string;
    versiones?: VersionPlantillaModel[]; ID_VERSION_PLANTILLA?: number; idVersionPlantilla?: number;
    ID_PLANTILLA_FK?: number; VERSION?: number; version?: number;
    MAPEO_EXCEL_JSON?: VersionPlantillaModel['mapeoExcelJson']; mapeoExcelJson?: VersionPlantillaModel['mapeoExcelJson'];
    ID_USUARIO_CREADOR_FK?: number; idUsuarioCreador?: number; CREATED_AT?: Date; createdAt?: Date;
    ID_DOCUMENTOS_FK?: number; iddocumentos?: number;
  };
}

import type { PlantillaModel, VersionPlantillaModel } from "@/tipos/entidades";

const processPlantillasRealtime = (
  plantillasActuales: PlantillaModel[],
  payload: EventoRealtimePayload
): PlantillaModel[] => {
  const { tabla, operacion, data } = payload;

  // 1. EVENTOS DIRECTOS EN LA TABLA PADRE: plantillas
  if (tabla === "plantillas") {
    const fila: PlantillaModel = {
      idPlantilla: Number(data.ID_PLANTILLA ?? data.idPlantilla),
      modulo: data.MODULO ?? data.modulo ?? "COTIZACIONES",
      activa: Boolean(data.ACTIVA ?? data.activa ?? true),
      nombre: data.NOMBRE ?? data.nombre ?? "",
      versiones: data.versiones ?? [],
    };
    const id = fila.idPlantilla;

    if (operacion === "DELETE") {
      return plantillasActuales.filter((p) => p.idPlantilla !== id);
    }

    const existe = plantillasActuales.some((p) => p.idPlantilla === id);
    if (operacion === "INSERT") {
      return existe
        ? plantillasActuales
        : [fila, ...plantillasActuales];
    }
    if (operacion === "UPDATE") {
      return plantillasActuales.map((p) => (p.idPlantilla === id ? { ...p, ...fila } : p));
    }
  }

  // 2. EVENTOS EN LA TABLA HIJA: version_plantilla
  if (tabla === "version_plantilla" || tabla === "version_plantillas") {
    const version: VersionPlantillaModel = {
      idVersionPlantilla: Number(data.ID_VERSION_PLANTILLA ?? data.idVersionPlantilla),
      idPlantilla: Number(data.ID_PLANTILLA_FK ?? data.idPlantilla),
      version: Number(data.VERSION ?? data.version ?? 1),
      mapeoExcelJson: data.MAPEO_EXCEL_JSON ?? data.mapeoExcelJson ?? null,
      idUsuarioCreador: Number(data.ID_USUARIO_CREADOR_FK ?? data.idUsuarioCreador),
      createdAt: data.CREATED_AT ?? data.createdAt ?? new Date(),
      iddocumentos: data.ID_DOCUMENTOS_FK ?? data.iddocumentos ?? null,
    };
    const idPlantilla = version.idPlantilla;
    const idVersion = version.idVersionPlantilla;

    return plantillasActuales.map((plantilla) => {
      if (plantilla.idPlantilla !== idPlantilla) return plantilla;

      const versiones = plantilla.versiones ?? [];

      if (operacion === "DELETE") {
        return {
          ...plantilla,
          versiones: versiones.filter((v) => v.idVersionPlantilla !== idVersion),
        };
      }

      const existe = versiones.some((v) => v.idVersionPlantilla === idVersion);
      if (operacion === "INSERT") {
        return {
          ...plantilla,
          versiones: existe ? versiones : [...versiones, version],
        };
      }

      // UPDATE
      return {
        ...plantilla,
        versiones: versiones.map((v) =>
          v.idVersionPlantilla === idVersion ? { ...v, ...version } : v
        ),
      };
    });
  }

  // 3. EVENTOS EN LA TABLA NIETA: documentos_plantillas (sin correlato directo en el schema actual)
  return plantillasActuales;
};

export default processPlantillasRealtime;
