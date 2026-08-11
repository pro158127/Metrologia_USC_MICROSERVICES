'use client';

import React, { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Edit3,
  Power,
  Search,
  X,
  Save,
  History,
  Calendar,
  Filter,
} from "lucide-react";
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";
import {
  obtenerTodasLasTarifas,
  crearTarifa,
  actualizarPrecioTarifa,
  cambiarEstadoTarifa,
  TarifaModel,
  actulzar_tarifa,
} from "@/app/action_module/tarifas";

// ----------------------------------------------------------------------
// Interfaces
// ----------------------------------------------------------------------
export interface PriceRecord {
  idHistorial: number;
  precioU: number;
  fechaInicio: string;
  fechaFin: string | null;
}

export interface CatalogItem {
  idTarifa: number;
  magnitud: string;
  instrumento: string;
  tipoServicio: string;
  norma: string;
  estado: "ACTIVO" | "INACTIVO";
  acreditadoONAC: boolean;
  precioVigente: number;
  fechaFin: string | null;
  historialPrecios: PriceRecord[];
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
};

// ----------------------------------------------------------------------
// Componentes Hijos
// ----------------------------------------------------------------------

const CatalogHeaderControls = ({
  searchTerm,
  setSearchTerm,
  selectedMagnitud,
  setSelectedMagnitud,
  selectedTipoServicio,
  setSelectedTipoServicio,
  magnitudesDisponibles,
  tiposServicioDisponibles,
  onOpenCreate,
}: {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedMagnitud: string;
  setSelectedMagnitud: (v: string) => void;
  selectedTipoServicio: string;
  setSelectedTipoServicio: (v: string) => void;
  magnitudesDisponibles: string[];
  tiposServicioDisponibles: string[];
  onOpenCreate: () => void;
}) => {
  return (
    <div className="flex flex-col space-y-4 px-6 py-5 border-b border-slate-100 bg-slate-50/50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-5 w-1 bg-[#5680F9] rounded-full"></span>
            <h2 className="text-base font-bold text-slate-800">Catálogo de Tarifas Metrológicas</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 ml-3">
            Gestión de tarifas e historial de precios sincronizados en tiempo real
          </p>
        </div>

        <button
          onClick={() => {
            onOpenCreate();
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#5680F9] hover:bg-blue-600 text-white font-medium text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap self-end sm:self-auto"
        >
          <Plus size={15} />
          <span>Nuevo Ítem</span>
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por equipo, norma o magnitud..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] transition"
          />
        </div>

        <div className="relative flex items-center">
          <Filter size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
          <select
            value={selectedMagnitud}
            onChange={(e) => setSelectedMagnitud(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] transition appearance-none"
          >
            <option value="TODAS">Todas las Magnitudes</option>
            {magnitudesDisponibles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex items-center">
          <Filter size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
          <select
            value={selectedTipoServicio}
            onChange={(e) => setSelectedTipoServicio(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] transition appearance-none"
          >
            <option value="TODOS">Todos los Tipos de Servicio</option>
            {tiposServicioDisponibles.map((ts) => (
              <option key={ts} value={ts}>
                {ts}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

/** Modal para Ver el Historial de Precios */
const PriceHistoryModal = ({
  isOpen,
  onClose,
  item,
}: {
  isOpen: boolean;
  onClose: () => void;
  item: CatalogItem | null;
}) => {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[#5680F9]" />
            <h3 className="text-sm font-bold text-slate-800">Historial de Precios</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-xs font-bold text-slate-800">{item.instrumento}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Servicio: {item.tipoServicio}</div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {item.historialPrecios.map((record) => {
              const isCurrent = !record.fechaFin;
              return (
                <div
                  key={record.idHistorial}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    isCurrent
                      ? "bg-blue-50/40 border-blue-200 text-blue-900"
                      : "bg-white border-slate-100 text-slate-600"
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-800 font-mono text-sm">
                      {formatCurrency(record.precioU)}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar size={10} />
                      <span>
                        {new Date(record.fechaInicio).toLocaleDateString("es-CO")} —{" "}
                        {record.fechaFin
                          ? new Date(record.fechaFin).toLocaleDateString("es-CO")
                          : "Vigente actual"}
                      </span>
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="px-2 py-0.5 bg-[#5680F9] text-white text-[9px] font-bold rounded-full">
                      Vigente
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Modal de formulario (Nuevo/Editar) con toggle para Acreditado */
const CatalogFormModal = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<CatalogItem> & { fechaInicio?: string; fechaFin?: string | null }) => void;
  initialData?: CatalogItem | null;
  isSaving: boolean;
}) => {
  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<Partial<CatalogItem> & { fechaInicio?: string; fechaFin?: string | null }>({
    instrumento: "",
    magnitud: "Masa",
    tipoServicio: "Calibración Acreditada", // valor por defecto
    precioVigente: 0,
    acreditadoONAC: true,
    fechaInicio: today,
    fechaFin: null,
    norma: "",
  });

  // Al abrir el modal, precargar datos
  useEffect(() => {
    if (initialData) {
      const historialVigente = initialData.historialPrecios?.find(h => !h.fechaFin);
      setFormData({
        idTarifa: initialData.idTarifa,
        instrumento: initialData.instrumento,
        magnitud: initialData.magnitud,
        tipoServicio: initialData.tipoServicio,
        precioVigente: initialData.precioVigente,
        acreditadoONAC: initialData.acreditadoONAC,
        fechaInicio: historialVigente?.fechaInicio
          ? new Date(historialVigente.fechaInicio).toISOString().split('T')[0]
          : today,
        fechaFin: historialVigente?.fechaFin
          ? new Date(historialVigente.fechaFin).toISOString().split('T')[0]
          : null,
        norma: initialData.norma || "",
      });
    } else {
      setFormData({
        instrumento: "",
        magnitud: "Masa",
        tipoServicio: "Calibración Acreditada",
        precioVigente: 0,
        acreditadoONAC: true,
        fechaInicio: today,
        fechaFin: null,
        norma: "",
      });
    }
  }, [initialData, isOpen, today]);

  if (!isOpen) return null;

  // Manejar cambio del toggle
  const handleToggleAcreditado = (checked: boolean) => {
    setFormData({
      ...formData,
      acreditadoONAC: checked,
      tipoServicio: checked ? "ACREDITADO" : "NO ACREDITADO",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.fechaFin && formData.fechaInicio && formData.fechaFin < formData.fechaInicio) {
      alert("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    // Asegurar que tipoServicio esté sincronizado con acreditadoONAC
    console.log(formData)
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-800">
            {initialData ? "Editar Tarifa / Actualizar Precio" : "Nueva Tarifa de Catálogo"}
          </h3>
          <button onClick={onClose} disabled={isSaving} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Instrumento / Magnitud a Calibrar
              </label>
              <input
                required
                disabled={isSaving}
                type="text"
                value={formData.instrumento || ""}
                onChange={(e) => setFormData({ ...formData, instrumento: e.target.value })}
                placeholder="ej: Balanza Analítica (Clase I)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Magnitud</label>
              <input
                required
                disabled={isSaving}
                type="text"
                value={formData.magnitud || ""}
                onChange={(e) => setFormData({ ...formData, magnitud: e.target.value })}
                placeholder="ej: Masa, Temperatura, Presión"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none disabled:bg-slate-100"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Precio Vigente (COP) {initialData && <span className="text-blue-500 font-normal">(Crea un nuevo historial al modificar)</span>}
              </label>
              <input
                required
                disabled={isSaving}
                type="number"
                min="0"
                value={formData.precioVigente || 0}
                onChange={(e) => setFormData({ ...formData, precioVigente: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Fecha de Inicio</label>
              <input
                required
                disabled={isSaving}
                type="date"
                value={formData.fechaInicio || ""}
                onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Fecha de Fin <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input
                disabled={isSaving}
                type="date"
                value={formData.fechaFin || ""}
                onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value || null })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none disabled:bg-slate-100"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Norma/Procedimiento
              </label>
              <textarea
                disabled={isSaving}
                rows={2}
                value={formData.norma || ""}
                onChange={(e) => setFormData({ ...formData, norma: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9] outline-none disabled:bg-slate-100 resize-none"
              />
            </div>
          </div>

          {/* Toggle de Acreditado - sustituye al input de tipo de servicio */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-700">Acreditado </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                disabled={isSaving}
                checked={formData.tipoServicio=="ACREDITADO"}
                onChange={(e) => handleToggleAcreditado(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#5680F9]"></div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#5680F9] text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition shadow-sm disabled:opacity-50"
            >
              <Save size={14} />
              <span>{isSaving ? "Guardando..." : initialData ? "Actualizar" : "Crear"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/** Fila de la tabla */
const CatalogRow = ({
  item,
  onEdit,
  onToggleStatus,
  onViewHistory,
}: {
  item: CatalogItem;
  onEdit: (item: CatalogItem) => void;
  onToggleStatus: (idTarifa: number, estadoActual: "ACTIVO" | "INACTIVO") => void;
  onViewHistory: (item: CatalogItem) => void;
}) => {
  return (
    <tr className="hover:bg-slate-50/60 transition-colors">
      <td className="px-4 py-3 align-top">
        <div className="font-semibold text-slate-800">{item.instrumento}</div>
      </td>
      <td className="px-4 py-3 align-top text-slate-600">{item.magnitud}</td>
      <td className="px-4 py-3 align-top text-slate-600">{item.norma || "N/A"}</td>
      <td className="px-4 py-3 align-top font-mono text-slate-700">{formatCurrency(item.precioVigente)}</td>
      <td className="px-4 py-3 align-top">
        <button
          type="button"
          onClick={() => onViewHistory(item)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
        >
          <History size={13} />
          <span>Ver</span>
        </button>
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${item.tipoServicio=="ACREDITADO" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {item.tipoServicio=="ACREDITADO" ? "Sí" : "No"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${item.estado === "ACTIVO" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {item.estado}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="p-2 text-slate-500 hover:text-[#5680F9] hover:bg-blue-50 rounded-lg transition"
            title="Editar"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onToggleStatus(item.idTarifa, item.estado)}
            className={`p-2 rounded-lg transition ${item.estado === "ACTIVO" ? "text-emerald-600 hover:bg-emerald-50" : "text-rose-600 hover:bg-rose-50"}`}
            title={item.estado === "ACTIVO" ? "Desactivar" : "Activar"}
          >
            <Power size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ----------------------------------------------------------------------
// Componente principal
// ----------------------------------------------------------------------
export const CatalogTableView = () => {
  const tarifas = useDbTable("tarifas");
  const { setDbState } = useDbActions();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMagnitud, setSelectedMagnitud] = useState("TODAS");
  const [selectedTipoServicio, setSelectedTipoServicio] = useState("TODOS");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Mapeador de la respuesta de Prisma a CatalogItem
  const mapTarifaToCatalog = (tarifaList: any[]): CatalogItem[] => {
    return (tarifaList || []).map((t) => {
      const historialOrdenado = [...(t.historial || [])].sort(
        (a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()
      );

      const historialActivo = historialOrdenado.find((h: any) => !h.fechaFin) || historialOrdenado[0];
      const precioVigente = historialActivo ? Number(historialActivo.precioU ?? 0) : 0;

      return {
        idTarifa: t.idTarifa,
        magnitud: t.magnitud,
        instrumento: t.Instrumento || t.instrumento || "Sin nombre",
        tipoServicio: t.tipoServicio,
        norma: t.Norma || "N/A",
        estado: (t.estado as "ACTIVO" | "INACTIVO") || "ACTIVO",
        acreditadoONAC: String(t.tipoServicio || "").toLowerCase().includes("acreditad"),
        precioVigente,
        fechaFin: historialActivo?.fechaFin ? new Date(historialActivo.fechaFin).toISOString() : null,
        historialPrecios: historialOrdenado.map((h: any) => ({
          idHistorial: h.idHistorial,
          precioU: Number(h.precioU ?? 0),
          fechaInicio: new Date(h.fechaInicio).toISOString(),
          fechaFin: h.fechaFin ? new Date(h.fechaFin).toISOString() : null,
        })),
      };
    });
  };

  const recargarTarifas = async () => {
    const res = await obtenerTodasLasTarifas();
    if (res.ok && res.data) {
      setDbState((prev) => ({
        ...prev,
        tarifas: res.data as any,
      }));
    }
  };

  useEffect(() => {
    recargarTarifas();
  }, []);

  const catalog = useMemo(() => mapTarifaToCatalog(tarifas || []), [tarifas]);

  const magnitudesDisponibles = useMemo(() => {
    return Array.from(new Set(catalog.map((i) => i.magnitud))).filter(Boolean);
  }, [catalog]);

  const tiposServicioDisponibles = useMemo(() => {
    return Array.from(new Set(catalog.map((i) => i.tipoServicio))).filter(Boolean);
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const searchLower = (searchTerm || "").toLowerCase();
      const matchesSearch =
        (item.instrumento || "").toLowerCase().includes(searchLower) ||
        (item.tipoServicio || "").toLowerCase().includes(searchLower) ||
        (item.magnitud || "").toLowerCase().includes(searchLower) ||
        (item.norma || "").toLowerCase().includes(searchLower);

      const matchesMagnitud = selectedMagnitud === "TODAS" || item.magnitud === selectedMagnitud;
      const matchesTipoServicio = selectedTipoServicio === "TODOS" || item.tipoServicio === selectedTipoServicio;

      return matchesSearch && matchesMagnitud && matchesTipoServicio;
    });
  }, [catalog, searchTerm, selectedMagnitud, selectedTipoServicio]);

  // ---- Lógica unificada de guardado ----
  const handleSaveItem = async (formData: Partial<CatalogItem> & { fechaInicio?: string; fechaFin?: string | null }) => {
    setIsSaving(true);
    try {
      const fechaInicio = formData.fechaInicio || undefined;
      const fechaFin = formData.fechaFin || undefined;

      if (selectedItem) {
        // Editar: usar actulzar_tarifa
        const res = await actulzar_tarifa({
          idTarifa: selectedItem.idTarifa,
          magnitud: formData.magnitud,
          tipoServicio: formData.tipoServicio, // ya viene calculado
          instrumento: formData.instrumento,
          norma: formData.norma,
          precioVigente: formData.precioVigente,
          fechaInicio: fechaInicio,
          fechaFin: fechaFin,
        });

        if (res.ok) {
          await recargarTarifas();
          setIsFormOpen(false);
        } else {
          alert(res.error || "Error al actualizar la tarifa.");
        }
      } else {
        // Crear: usar crearTarifa
        const res = await crearTarifa({
          magnitud: formData.magnitud || "Masa",
          tipoServicio: formData.tipoServicio || "Calibración Acreditada",
          instrumento: formData.instrumento || "Nuevo Instrumento",
          precioInicial: Number(formData.precioVigente) || 0,
          norma: formData.norma,
          fechaInicio: fechaInicio,
          fechaFin: fechaFin,
        });

        if (res.ok) {
          await recargarTarifas();
          setIsFormOpen(false);
        } else {
          alert(res.error || "Error al crear la tarifa.");
        }
      }
    } catch (error) {
      console.error("Error en handleSaveItem:", error);
      alert("Ocurrió un error inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (idTarifa: number, estadoActual: "ACTIVO" | "INACTIVO") => {
    const nuevoEstado = estadoActual === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const res = await cambiarEstadoTarifa(idTarifa, nuevoEstado);
    if (res.ok) {
      await recargarTarifas();
    } else {
      alert(res.error || "Error al cambiar el estado.");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden">
      <CatalogHeaderControls
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedMagnitud={selectedMagnitud}
        setSelectedMagnitud={setSelectedMagnitud}
        selectedTipoServicio={selectedTipoServicio}
        setSelectedTipoServicio={setSelectedTipoServicio}
        magnitudesDisponibles={magnitudesDisponibles}
        tiposServicioDisponibles={tiposServicioDisponibles}
        onOpenCreate={() => {
          setSelectedItem(null);
          setIsFormOpen(true);
        }}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {["Instrumento", "Magnitud", "Norma", "Precio Vigente", "Historial", "Acreditado", "Estado", "Acciones"].map(
                (h) => (
                  <th key={h} className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCatalog.length > 0 ? (
              filteredCatalog.map((item) => (
                <CatalogRow
                  key={item.idTarifa}
                  item={item}
                  onEdit={(selected: CatalogItem) => {
                    setSelectedItem(selected);
                    setIsFormOpen(true);
                  }}
                  onToggleStatus={handleToggleStatus}
                  onViewHistory={(selected: CatalogItem) => {
                    setSelectedItem(selected);
                    setIsHistoryOpen(true);
                  }}
                />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron tarifas que coincidan con los criterios de búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CatalogFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveItem}
        initialData={selectedItem}
        isSaving={isSaving}
      />

      <PriceHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        item={selectedItem}
      />
    </div>
  );
};

export default CatalogTableView;