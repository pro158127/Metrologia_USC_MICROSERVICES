import { create } from 'zustand';
import type RealtimeTablesState from '@/tipos/store';
import { obtenerLlavePrimaria } from '@/app/lib/realtime/normalize';
import { obtenerRevisionRealtime } from '@/app/lib/realtime/revision';

// Importa tus Server Actions
import { obtenerUsuariosPorPermiso,obtenerRolesAction } from '@/app/action_module/administration';
import { obtenerTodasLasCotizaciones } from '@/app/action_module/cotizacion';
import { obtenerTodasLasTarifas } from '@/app/action_module/tarifas';
import { obtenerClientes } from '@/app/action_module/modulo_cliente';
import { obtenerRecepcionesVigentes } from '@/app/action_module/recepciones';
import { obtenerOrdenesListado } from '@/app/action_module/ordenes';
import { obtenerFacturas } from '@/app/action_module/facturas';
import { obtenerParametrosSistema } from '@/app/action_module/parametros_sistema';
import { obtenerCertificadosConContexto } from '@/app/action_module/certificados';
import { obtenerSellos } from '@/app/action_module/sellos';
import { obtenerSeguimientos } from '@/app/action_module/seguimiento';
export const TABLAS_CON_SNAPSHOT = [
  'usuarios', 'cotizaciones', 'tarifas', 'clientes', 'recepciones_equipo',
  'ordenes_trabajo', 'roles', 'facturas', 'seguimientos_comerciales',
  'sellos', 'parametros_sistema', 'certificados',
] as const satisfies readonly (keyof RealtimeTablesState)[];

const cargasEnCurso = new Map<keyof RealtimeTablesState, Promise<boolean>>();

const initialState: RealtimeTablesState = {
  usuarios: [],
  tarifas: [],
  notificaciones: [],
  audit_logs: [],
  roles: [],
  plantillas: [],
  clientes: [],
  cotizaciones: [],
  cotizacion_detalles: [],
  ordenes_trabajo: [],
  orden_trabajo_detalles: [],
  recepciones_equipo: [],
  recepcion_equipo_detalles: [],
  documentos: [],
  version_documentos: [],
  calibraciones: [],
  certificados: [],
  certificado_sellos: [],
  document_chunks: [],
  historial_estado_cotizacion: [],
  historial_tarifas: [],
  parametros_sistema: [],
  sellos: [],
  tramites: [],
  version_plantillas: [],
  facturas: [],
  plantillas_sellos:[],
  seguimientos_comerciales: [],
  
};

export const useDbStore = create<
  RealtimeTablesState & {
    loading: { [K in keyof RealtimeTablesState]?: boolean };
    initialized: boolean;
    setDbState: (updater: (prev: RealtimeTablesState) => RealtimeTablesState) => void;
    updateTable: <K extends keyof RealtimeTablesState>(
      table: K,
      updater: (prev: RealtimeTablesState[K]) => RealtimeTablesState[K]
    ) => void;
    mergeTable: <K extends keyof RealtimeTablesState>(
      table: K,
      rows: RealtimeTablesState[K]
    ) => void;
    setTableLoading: <K extends keyof RealtimeTablesState>(table: K, value: boolean) => void;
    loadAllData: () => Promise<void>;
    loadTable: <K extends keyof RealtimeTablesState>(table: K, force?: boolean) => Promise<boolean>;
    reset: () => void;
  }
>((set, get) => ({
  ...initialState,
  loading: {},
  initialized: false,

  setDbState: (updater) => set((state) => updater(state)),

updateTable: (table, updater) =>
  set((state) => {
    const currentTableData = state[table] || [];
    const updatedTableData = updater(currentTableData);
    
    // Retornamos un objeto de estado explícitamente NUEVO
    return {
      ...state,
      [table]: [...updatedTableData], 
    };
  }),

  // Fusiona un snapshot (fetch HTTP) con el estado actual por clave primaria:
  // - Las filas del snapshot (autoritativas) ganan sobre las solapadas.
  // - Las filas que solo existen en el estado actual (insertadas por webhook
  //   durante el fetch) se conservan al inicio para no ocultarlas.
  mergeTable: (table, rows) =>
    set((state) => {
      const actual = state[table] || [];
      const incoming = rows || [];

      const pkValida = (item: unknown): number | null => {
        const { idValor } = obtenerLlavePrimaria(table as string, item);
        return idValor !== undefined && idValor !== null && !isNaN(idValor) ? idValor : null;
      };

      const clavesIncoming = new Set<number>();
      for (const item of incoming) {
        const k = pkValida(item);
        if (k !== null) clavesIncoming.add(k);
      }

      const extras = actual.filter((item) => {
        const k = pkValida(item);
        return k !== null && !clavesIncoming.has(k);
      });

      return {
        ...state,
        [table]: [...extras, ...incoming],
      };
    }),

  setTableLoading: (table, value) =>
    set((s) => ({ loading: { ...s.loading, [table]: value } })),
  
  reset: () => set(() => ({ ...initialState, loading: {}, initialized: false })),

  loadTable: (table, force = false) => {
    const enCurso = cargasEnCurso.get(table);
    if (enCurso) return enCurso;
    if (!force && get()[table].length > 0 && table !== 'usuarios') return Promise.resolve(true);
    if (!TABLAS_CON_SNAPSHOT.some((tabla) => tabla === table)) return Promise.resolve(false);

    set((s) => ({ loading: { ...s.loading, [table]: true } }));
    const cargar = async (): Promise<boolean> => {
      let revisionAlIniciar: number;
      do {
        revisionAlIniciar = obtenerRevisionRealtime(table);
        let data: any[] = [];
        let snapshotValido = false;
        switch (table) {
          case 'usuarios': {
            const res = await obtenerUsuariosPorPermiso();
            if (res?.success && Array.isArray(res.data)) {
              snapshotValido = true;
              data = res.data.map((u: any) => ({
                ...u,
                rolnombre: u.rol?.nombreRol || 'Sin rol',
              }));
            }
            break;
          }
          case 'cotizaciones': {
            const res = await obtenerTodasLasCotizaciones();
            if (res.ok && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'tarifas': {
            const res = await obtenerTodasLasTarifas();
            if (res.ok && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'clientes': {
            const res = await obtenerClientes();
            if (res.success && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'recepciones_equipo': {
            const res = await obtenerRecepcionesVigentes();
            if (Array.isArray(res)) { data = res; snapshotValido = true; }
            break;
          }
          case 'ordenes_trabajo': {
            const res = await obtenerOrdenesListado();
            if (Array.isArray(res)) { data = res; snapshotValido = true; }
            break;
          }
          case 'roles':{
               const res = await obtenerRolesAction();
            if (res && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'facturas': {
            const res = await obtenerFacturas();
            if (res.ok && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'seguimientos_comerciales': {
            const res = await obtenerSeguimientos();
            if (res.ok && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'sellos': {
            const res = await obtenerSellos();
            if (res.success && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'parametros_sistema': {
            const res = await obtenerParametrosSistema();
            if (res.success && Array.isArray(res.data)) { data = res.data; snapshotValido = true; }
            break;
          }
          case 'certificados': {
            const res = await obtenerCertificadosConContexto();
            if (res.success && Array.isArray(res.data?.certificados)) {
              snapshotValido = true;
              data = res.data.certificados;
            }
            break;
          }
          default:
            console.warn(`⚠️ loadTable: Tabla "${table}" sin acción definida.`);
            data = [];
        }
        if (!snapshotValido) return false;
        if (revisionAlIniciar === obtenerRevisionRealtime(table)) {
          set({ [table]: data });
          return true;
        }
      } while (true);
    };

    const carga = cargar().catch((error: unknown) => {
      console.error(`Error al cargar tabla "${table}":`, error);
      return false;
    }).finally(() => {
      cargasEnCurso.delete(table);
      get().setTableLoading(table, false);
    });
    cargasEnCurso.set(table, carga);
    return carga;
  },

  loadAllData: async () => {
    const state = get();
    if (state.initialized && state.clientes.length > 0) {
      console.log('⏳ Store ya inicializado, omitiendo recarga masiva.');
      return;
    }
    console.log('🚀 Iniciando carga masiva de datos...');
    set({ loading: {}, initialized: false });

    const tablesToLoad: (keyof RealtimeTablesState)[] = [
      'usuarios',
      'cotizaciones',
      'tarifas',
      'clientes',
      'roles',
      'recepciones_equipo',
      'ordenes_trabajo',
      'facturas',
    ];

    await Promise.allSettled(
      tablesToLoad.map((table) => get().loadTable(table))
    );

    set({ initialized: true });
    console.log('✅ Carga masiva de datos finalizada.');
  },
}));
