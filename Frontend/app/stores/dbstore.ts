import { create } from 'zustand';
import type RealtimeTablesState from '@/app/componets/tables_recharge';

// Importa tus Server Actions
import { obtenerUsuariosPorPermiso,obtenerRolesAction } from '@/app/action_module/administration';
import { obtenerTodasLasCotizaciones } from '@/app/action_module/cotizacion';
import { obtenerTodasLasTarifas } from '@/app/action_module/tarifas';
import { obtenerClientes } from '@/app/action_module/modulo_cliente';
import { getInitialData as getRecepcionesData } from '@/app/action_module/recepciones';
import { obtenerDatosIniciales as getOrdenesData } from '@/app/action_module/ordenes';

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
    loadAllData: () => Promise<void>;
    loadTable: <K extends keyof RealtimeTablesState>(table: K) => Promise<void>;
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
  
  reset: () => set(() => ({ ...initialState, loading: {}, initialized: false })),

  loadTable: async (table) => {
    const state = get();
    if (state[table].length > 0 && table !== 'usuarios') return;

    set((s) => ({ loading: { ...s.loading, [table]: true } }));
    try {
      let data: any[] = [];
      switch (table) {
        case 'usuarios': {
          const res = await obtenerUsuariosPorPermiso();
          if (res?.success && Array.isArray(res.data)) {
            data = res.data.map((u: any) => ({
              ...u,
              rolnombre: u.rol?.nombreRol || 'Sin rol',
            }));
          }
          break;
        }
        case 'cotizaciones': {
          const res = await obtenerTodasLasCotizaciones();
          if (res.ok && Array.isArray(res.data)) data = res.data;
          break;
        }
        case 'tarifas': {
          const res = await obtenerTodasLasTarifas();
          if (res.ok && Array.isArray(res.data)) data = res.data;
          break;
        }
        case 'clientes': {
          const res = await obtenerClientes();
          if (res.success && Array.isArray(res.data)) data = res.data;
          break;
        }
        case 'recepciones_equipo': {
          const res = await getRecepcionesData();
          if (res && Array.isArray(res.recepciones)) data = res.recepciones;
          break;
        }
        case 'ordenes_trabajo': {
          const res = await getOrdenesData();
          if (res && Array.isArray(res.ordenes)) data = res.ordenes;
          break;
        }
        case 'roles':{
             const res = await obtenerRolesAction();
          if (res && Array.isArray(res.data)) data = res.data;
          break;
        }
        default:
          console.warn(`⚠️ loadTable: Tabla "${table}" sin acción definida.`);
          data = [];
      }
      set((s) => ({
        ...s,
        [table]: data || [],
        loading: { ...s.loading, [table]: false },
      }));
    } catch (error) {
      console.error(`❌ Error al cargar tabla "${table}":`, error);
      set((s) => ({
        loading: { ...s.loading, [table]: false },
      }));
    }
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
    ];

    await Promise.allSettled(
      tablesToLoad.map((table) => get().loadTable(table))
    );

    set({ initialized: true });
    console.log('✅ Carga masiva de datos finalizada.');
  },
}));