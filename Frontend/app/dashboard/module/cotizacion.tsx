'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Search, Eye, X, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import CatalogTableView from "./componentes/compoenete_cotizacion/tartifas";
import { AiAgentWidget } from "./componentes/AI_MODULE/AiAgentWidget";
import { useDbTable, useDbActions, useDbLoading } from "@/app/componets/tables_recharge";
import {
  obtenerTodasLasCotizaciones,
  crearCotizacion,
  actualizarCotizacion,
  cambiarEstadoCotizacion,
} from "@/app/action_module/cotizacion";
import { Estados } from "@/tipos/enums";
import type { ClienteModel, CotizacionModel, HistorialEstadoCotizacionModel } from "@/tipos/entidades";
import type {
  QuoteItem,
  TarifaOption,
  HistorialItem,
  ViewCotizacion,
  CotizacionVista,
  CotizacionDetalleVista,
  cambiospayload,
  HeaderBarProps,
  ItemsTableProps,
  VersionModalProps,
  TimelineHistorialProps,
  QuotationListTableProps,
  QuotationDetailViewProps,
  CreateQuotationWizardProps,
} from "@/tipos/cotizacion";
import { transicionesValidas } from "@/tipos/cotizacion";
import { useSession } from "next-auth/react";

// ==========================================
// Tipos y Estilos
// ==========================================

// Mapeo de colores para todos los estados del enum
const estadoStyle: Record<string, { bg: string; color: string; border: string }> = {
  BORRADOR:       { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
  ENVIADA:        { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  APROBADA:       { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  RECHAZADA:      { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  EN_SEGUIMIENTO: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
};

const SELECT_CLASS = "w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:border-[#5680F9] outline-none disabled:bg-slate-50";

// ==========================================
// Componentes Hijos
// ==========================================

const ToastNotification = ({ toast }: { toast: string }) => {
  if (!toast) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {toast}
    </div>
  );
};

const HeaderBar = ({
  view,
  setView,
  setStep,
  onNewQuote,
}: HeaderBarProps) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {view !== "list" && (
          <button
            onClick={() => { setView("list"); setStep(1); }}
            className="flex items-center gap-1 text-xs font-bold text-[#5680F9] bg-transparent border-none cursor-pointer hover:text-[#4069E2] transition-colors"
          >
            ← Cotizaciones
          </button>
        )}
        <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          {view === "list" ? "Cotizaciones" : view === "create" ? "Nueva cotización" : "Catálogo de Tarifas"}
        </h1>
      </div>
      {view === "list" && (
        <div className="flex gap-2">
          <button
            onClick={() => setView("catalog")}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white text-xs font-bold cursor-pointer hover:bg-slate-50 transition-colors"
          >
            Catálogo de tarifas
          </button>
          <button
            onClick={onNewQuote || (() => setView("create"))}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#5680F9] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#4069E2] transition-colors shadow-[0_2px_8px_rgba(86,128,249,0.25)]"
          >
            <Plus size={15} /> Nueva cotización
          </button>
        </div>
      )}
    </div>
  );
};

const ItemsTable = ({
  itemsList,
  target,
  manejarCambioFila,
  eliminarFila,
  tarifasOptions,
  getMagnitudesByTipo,
  getInstrumentosByMagnitudAndTipo,
}: ItemsTableProps) => {
  const tiposServicio = useMemo(
    () => Array.from(new Set(tarifasOptions.map((t) => t.tipoServicio))),
    [tarifasOptions]
  );

  const magnitudesPorTipo = useMemo(() => {
    const map = new Map<string, string[]>();
    tarifasOptions.forEach((t) => {
      const lista = map.get(t.tipoServicio) ?? [];
      if (!lista.includes(t.magnitud)) lista.push(t.magnitud);
      map.set(t.tipoServicio, lista);
    });
    return map;
  }, [tarifasOptions]);

  const instrumentosPorTipoMagnitud = useMemo(() => {
    const map = new Map<string, TarifaOption[]>();
    tarifasOptions.forEach((t) => {
      const key = `${t.magnitud}|${t.tipoServicio}`;
      const lista = map.get(key) ?? [];
      lista.push(t);
      map.set(key, lista);
    });
    return map;
  }, [tarifasOptions]);

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs text-slate-700">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            <th className="py-3.5 px-4">Tipo Servicio</th>
            <th className="py-3.5 px-4">Magnitud</th>
            <th className="py-3.5 px-4">Equipo / Puntos</th>
            <th className="py-3.5 px-4">Lugar Calibración</th>
            <th className="py-3.5 px-4">Norma</th>
            <th className="py-3.5 px-4">Cantidad</th>
            <th className="py-3.5 px-4">V. Unitario</th>
            <th className="py-3.5 px-4 text-center">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {itemsList.map((fila, index) => {
            const magnitudesFiltradas = fila.tipoServicio
              ? (magnitudesPorTipo.get(fila.tipoServicio) ?? [])
              : [];

            const instrumentosFiltrados = fila.magnitud && fila.tipoServicio
              ? (instrumentosPorTipoMagnitud.get(`${fila.magnitud}|${fila.tipoServicio}`) ?? [])
              : [];

            const esLugarBloqueado = fila.magnitud === "Temperatura" || fila.magnitud === "Humedad";

            return (
              <tr key={fila.id} className="hover:bg-slate-50/50 bg-white transition-colors">
                <td className="py-2.5 px-3">
                  <select
                    value={fila.tipoServicio}
                    onChange={(e) => manejarCambioFila(index, "tipoServicio", e.target.value, target)}
                    className={SELECT_CLASS}
                  >
                    <option value="">Seleccionar...</option>
                    {tiposServicio.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-3">
                  <select
                    value={fila.magnitud}
                    disabled={!fila.tipoServicio}
                    onChange={(e) => manejarCambioFila(index, "magnitud", e.target.value, target)}
                    className={SELECT_CLASS}
                  >
                    <option value="">Seleccionar...</option>
                    {magnitudesFiltradas.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-3">
                  <select
                    value={fila.instrumento}
                    disabled={!fila.magnitud}
                    onChange={(e) => manejarCambioFila(index, "instrumento", e.target.value, target)}
                    className={SELECT_CLASS}
                  >
                    <option value="">Seleccionar...</option>
                    {instrumentosFiltrados.map((item) => (
                      <option key={item.instrumento} value={item.instrumento}>
                        {item.instrumento}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-3">
                  <select
                    value={fila.lugarCalibracion}
                    disabled={esLugarBloqueado || !fila.magnitud}
                    onChange={(e) => manejarCambioFila(index, "lugarCalibracion", e.target.value as QuoteItem["lugarCalibracion"], target)}
                    className={`${SELECT_CLASS} font-semibold disabled:bg-slate-100`}
                  >
                    <option value="Laboratorio">Laboratorio</option>
                    <option value="Sitio">Sitio</option>
                  </select>
                </td>
                <td className="py-2.5 px-3 text-slate-500 font-mono font-medium">{fila.norma}</td>
   <td className="py-2.5 px-3">
  <input
    type="number"
    min="1"
    
    max="100"
    value={fila.cantidad === 0 ? "" : fila.cantidad} // 👈 Muestra vacante el input si el estado llega a 0
    onFocus={(e) => e.target.select()}
    onChange={(e) => {
      const val = e.target.value;
      // Si el usuario borra el campo, enviamos 0 temporalmente en lugar de forzar un 1 de inmediato
      const valorValido = val === "" ? 0 : parseInt(val, 10);

      manejarCambioFila(index, "cantidad", valorValido, target);
    }}
    onBlur={() => {
      // Si el usuario deja la casilla en blanco o en 0 y cambia de campo, reseteamos a 1
      if (!fila.cantidad || fila.cantidad < 1) {
        manejarCambioFila(index, "cantidad", 1, target);
      }
    }}
    className="w-16 p-2 border border-slate-200 rounded-xl font-mono text-center outline-none focus:ring-2 focus:ring-teal-500"
  />
</td>
      <td className="py-2.5 px-3">
  <input
    type="number"
    min="0"
    step="any"
    value={fila.valorUnitario}
    readOnly // 👈 Inhabilita la edición por parte del usuario
    tabIndex={-1} // 👈 Evita que el cursor se detenga en este campo al presionar la tecla Tab
    className="w-28 p-2 border border-slate-200 rounded-xl font-mono text-right bg-slate-100 text-slate-500 cursor-not-allowed outline-none select-none"
  />
</td>
                <td className="py-2.5 px-3 text-center">
                  <button onClick={() => eliminarFila(fila.id, target)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg">
                    <X size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const VersionModal: React.FC<VersionModalProps> = ({

  isOpen,
  onClose,
  modalItems,
  modalDescuento,
  setModalDescuento,
  modalViaticos,
  setModalViaticos,
  agregarFila,
  eliminarFila,
  manejarCambioFila,
  calculateTotal,
  formatCurrency,
  saveNewVersion,
  isSaving,
  tarifasOptions,
  getMagnitudesByTipo,
  getInstrumentosByMagnitudAndTipo,
  usu_rol,
}) => {
  // Estado para alternar entre edición y confirmación de historial
  const [step, setStep] = useState<'EDIT' | 'CONFIRM_VERSION'>('EDIT');

  // Estado local para los campos requeridos por `HistorialCambios`
  const [auditForm, setAuditForm] = useState<cambiospayload>({
    descripcion: '',
    aprobo: usu_rol,
    requiereValidacionHoja: false,
    observaciones: '',
  });

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('EDIT');
    setAuditForm({ descripcion: '', aprobo: usu_rol, requiereValidacionHoja: false, observaciones: '' });
    setFormErrors({});
    onClose();
  };

  const validateAuditForm = (): boolean => {
    const errors: { [key: string]: string } = {};
    if (!auditForm.descripcion.trim()) {
      errors.descripcion = 'La descripción del cambio es obligatoria.';
    }
    if (!auditForm.aprobo.trim()) {
      errors.aprobo = 'Debe especificar quién aprueba este cambio.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAuditForm()) return;
    await saveNewVersion(auditForm);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {step === 'EDIT' ? 'Generar nueva versión de cotización' : 'Registro de Auditoría y Control de Versionado'}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              {step === 'EDIT'
                ? 'Paso 1: Modifica los ítems y estructura comercial.'
                : 'Paso 2: Completa la información del cambio para la trazabilidad en PostgreSQL.'}
            </p>
          </div>
          <button onClick={handleClose} disabled={isSaving} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {step === 'EDIT' ? (
            /* PASO 1: Edición de Tabla e Ítems */
            <>
              <button
                type="button"
                onClick={() => agregarFila("modal")}
                className="w-36 h-9 self-end bg-white text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-all"
              >
                Agregar ítems
              </button>

              <ItemsTable
                itemsList={modalItems}
                target="modal"
                manejarCambioFila={manejarCambioFila}
                eliminarFila={eliminarFila}
                tarifasOptions={tarifasOptions}
                getMagnitudesByTipo={getMagnitudesByTipo}
                getInstrumentosByMagnitudAndTipo={getInstrumentosByMagnitudAndTipo}
              />

              <div className="w-full max-w-sm bg-slate-50 border border-slate-100 rounded-xl p-4 self-end flex flex-col gap-2">
                <div className="flex justify-between items-center text-slate-500 font-medium text-xs">
                  <span>Descuento comercial:</span>
                  <select
                    value={modalDescuento}
                    onChange={(e) => setModalDescuento(Number(e.target.value))}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value={0}>0 %</option>
                    <option value={10}>10 %</option>
                    <option value={15}>15 %</option>
                    <option value={20}>20 %</option>
                  </select>
                </div>
                <div className="flex justify-between items-center text-slate-500 font-medium text-xs">
                  <span>Viáticos:</span>
                  <input
                    type="number"
                    min="0"
                    value={modalViaticos}
                    onChange={(e) => setModalViaticos(parseFloat(e.target.value) || 0)}
                    className="w-24 p-1.5 border border-slate-200 bg-white rounded-lg font-mono text-right font-bold text-slate-700 outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-bold text-slate-800">
                  <span>Total versión:</span>
                  <span className="text-sm font-black text-[#5680F9] font-mono">
                    {formatCurrency(calculateTotal(modalItems, modalDescuento, modalViaticos))}
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* PASO 2: Formulario de Auditoría (HistorialCambios) */
            <div className="max-w-xl mx-auto w-full space-y-4 py-2">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-600 flex flex-col gap-1">
                <span className="font-bold text-slate-800">Resumen del Cambio</span>
                <span>Ítems modificados: <strong className="text-slate-800">{modalItems.length}</strong></span>
                <span>Total de esta versión: <strong className="text-[#5680F9] font-mono">{formatCurrency(calculateTotal(modalItems, modalDescuento, modalViaticos))}</strong></span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700">
                  Descripción del cambio <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={auditForm.descripcion}
                  onChange={(e) => setAuditForm({ ...auditForm, descripcion: e.target.value })}
                  placeholder="Ej: Actualización de tarifas de calibración y adición de viáticos"
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9]"
                />
                {formErrors.descripcion && <span className="text-[10px] text-rose-500 font-medium">{formErrors.descripcion}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700">
                  Aprobado por (Nombre / Cargo) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={auditForm.aprobo}
                  onChange={(e) => setAuditForm({ ...auditForm, aprobo: e.target.value })}
                  placeholder="Ej: Ing. Carlos M. (Líder Técnico)"
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9]"
                />
                {formErrors.aprobo && <span className="text-[10px] text-rose-500 font-medium">{formErrors.aprobo}</span>}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="requiereValidacionHoja"
                  checked={auditForm.requiereValidacionHoja}
                  onChange={(e) => setAuditForm({ ...auditForm, requiereValidacionHoja: e.target.checked })}
                  className="rounded border-slate-300 text-[#5680F9] focus:ring-[#5680F9] h-4 w-4"
                />
                <label htmlFor="requiereValidacionHoja" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  ¿Requiere validación en hoja técnica/de campo?
                </label>
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <label className="text-xs font-bold text-slate-700">Observaciones adicionales</label>
                <textarea
                  rows={2}
                  value={auditForm.observaciones || ''}
                  onChange={(e) => setAuditForm({ ...auditForm, observaciones: e.target.value })}
                  placeholder="Comentarios u observaciones opcionales..."
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5680F9]/20 focus:border-[#5680F9]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 bg-white font-bold text-xs hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>

          <div className="flex gap-2">
            {step === 'CONFIRM_VERSION' && (
              <button
                onClick={() => setStep('EDIT')}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white font-bold text-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Volver a ítems
              </button>
            )}

            {step === 'EDIT' ? (
              <button
                onClick={() => setStep('CONFIRM_VERSION')}
                disabled={modalItems.length === 0}
                className="px-4 py-2 rounded-xl bg-[#5680F9] text-white font-bold text-xs hover:bg-[#4069E2] shadow-md shadow-[#5680F9]/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                Continuar a versionado <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 shadow-md shadow-emerald-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  'Guardando cambios...'
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Guardar cambios y versionar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// Secuencia fija del flujo de estados (puedes personalizarla)
const FLUJO_ESTADOS = [
  "BORRADOR",
  "ENVIADA",
  "APROBADA",
  "EN_SEGUIMIENTO",
];

export const TimelineHistorial: React.FC<TimelineHistorialProps> = ({
  items,
  loading = false,
  estadoActual,
 
}) => {
  // Determinar el índice del estado actual (último estado del historial o el pasado por prop)
  const ultimoEstado =
    estadoActual || (items.length > 0 ? items[items.length - 1].estadoNuevo : null);
  const indiceActual = ultimoEstado
    ? FLUJO_ESTADOS.indexOf(ultimoEstado)
    : -1;

  // 1. Estado de carga (skeleton horizontal)
  if (loading) {
    return (
      <div className="w-full animate-pulse">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex flex-col items-center flex-1">
              <div className="w-8 h-8 rounded-full bg-slate-200 mb-2" />
              <div className="h-3 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="relative mt-2">
          <div className="absolute top-4 left-0 right-0 h-1 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  // 2. Sin datos
  if (!items || items.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic py-4 text-center">
        Sin historial de cambios registrado.
      </div>
    );
  }

  // 3. Barra de progreso real
  return (
    <div className="w-full py-4">
      {/* Contenedor de los pasos */}
      <div className="flex items-center justify-between relative">
        {/* Línea de fondo (inactiva) */}
        <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200 rounded" />

        {/* Línea de progreso (activa) */}
        <div
          className="absolute top-4 left-0 h-1 bg-[#5680F9] rounded transition-all duration-500"
          style={{
            width: `${indiceActual >= 0 ? (indiceActual / (FLUJO_ESTADOS.length - 1)) * 100 : 0}%`,
          }}
        />

        {/* Pasos */}
        {FLUJO_ESTADOS.map((estado, idx) => {
          // Buscar si hay un registro en el historial para este estado
          const registro = items.find((item) => item.estadoNuevo === estado);
          const completado = idx <= indiceActual;
          const esActual = idx === indiceActual;

          return (
            <div
              key={estado}
              className="flex flex-col items-center relative z-10"
              style={{ flex: 1 }}
            >
              {/* Círculo */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors duration-300 ${
                  completado
                    ? "bg-[#5680F9] border-[#5680F9] text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-400"
                } ${esActual ? "ring-2 ring-[#5680F9]/20" : ""}`}
              >
                {completado ? "✓" : idx + 1}
              </div>

              {/* Etiqueta del estado */}
              <span
                className={`mt-2 text-[10px] font-bold uppercase tracking-wider text-center ${
                  completado ? "text-[#5680F9]" : "text-slate-400"
                }`}
              >
                {estado.replace(/_/g, " ")}
              </span>

              {/* Información del cambio (si existe en el historial) */}
              {registro && (
                <div className="mt-1 text-[9px] text-slate-500 text-center leading-tight">
                  <div className="font-medium truncate max-w-[80px]">
                    {registro.usuario?.nombreCompleto}
                  </div>
                  <div className="tabular-nums">
                    {new Date(registro.createdAt).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};



// ==========================================
// Tabla de cotizaciones con edición inline de estados
// ==========================================

const QuotationListTable = ({
  filtered,
  setSelectedQuotation,
  formatCurrency,
  onEstadoChange,
  updatingId,
}: QuotationListTableProps) => {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {["N° Cotización", "Cliente", "Valor total", "Estado", "Fecha", "Acciones"].map((h) => (
              <th key={h} className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => {
            const posiblesTransiciones = transicionesValidas[c.estado] || [];
            return (
              <tr key={c.idCotizacion} className="border-b border-slate-200 hover:bg-slate-50 transition-colors group">
                <td className="py-3 px-4 font-mono font-bold text-slate-700">{c.codigo}</td>
                <td className="py-3 px-4 text-slate-600 font-medium">{c.cliente?.razonSocial || "N/A"}</td>
                <td className="py-3 px-4 font-mono font-bold text-slate-700">{formatCurrency(c.montoTotal)}</td>
                <td className="py-3 px-4">
                  {posiblesTransiciones.length > 0 ? (
                    <select
                      value={c.estado}
                      onChange={(e) => onEstadoChange(c.idCotizacion, e.target.value as Estados)}
                      disabled={updatingId === c.idCotizacion}
                      className="px-2 py-1 rounded-full text-[10px] font-bold border bg-transparent focus:outline-none focus:ring-1 focus:ring-[#5680F9] disabled:opacity-60"
                      style={{
                        backgroundColor: estadoStyle[c.estado]?.bg || "#f1f5f9",
                        color: estadoStyle[c.estado]?.color || "#64748b",
                        borderColor: estadoStyle[c.estado]?.border || "#e2e8f0",
                      }}
                    >
                      <option value={c.estado}>{c.estado}</option>
                      {posiblesTransiciones.map((est) => (
                        <option key={est} value={est} style={{ backgroundColor: "white", color: "black" }}>
                          {est}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className="px-2 py-1 rounded-full text-[10px] font-bold border"
                      style={{
                        backgroundColor: estadoStyle[c.estado]?.bg || "#f1f5f9",
                        color: estadoStyle[c.estado]?.color || "#64748b",
                        borderColor: estadoStyle[c.estado]?.border || "#e2e8f0",
                      }}
                    >
                      {c.estado}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-500">{new Date(c.createdAt).toLocaleDateString("es-CO")}</td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => setSelectedQuotation(c)}
                    className="p-1.5 text-slate-400 hover:text-[#5680F9] hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
// ==========================================
// Detalle de cotización
// ==========================================
const QuotationDetailView = ({
  selectedQuotation,
  openVersionModal,
  showToast,
  setSelectedQuotation,
  historialitems,
  formatCurrency,
  loadingHistorial,
  onopentable,
}: QuotationDetailViewProps) => {
  const historial: HistorialItem[] = historialitems || [];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] p-6 mt-6 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-bold text-slate-800">Visualizando Cotización {selectedQuotation.codigo}</div>
          <div className="text-xs text-slate-500 font-medium">Información sincronizada con PostgreSQL</div>
        </div>
        <div className="flex flex-wrap gap-2">
                 <button type="button" onClick={onopentable} className="rounded-xl bg-[#5680F9] px-3 py-2 text-xs font-bold text-white hover:bg-[#4069E2] transition-colors shadow-sm shadow-[#5680F9]/10">
            Mostrar cambios
          </button>
          <button type="button" onClick={openVersionModal} className="rounded-xl bg-[#5680F9] px-3 py-2 text-xs font-bold text-white hover:bg-[#4069E2] transition-colors shadow-sm shadow-[#5680F9]/10">
            Generar nueva versión
          </button>
          <button type="button" onClick={() => showToast(`✅ PDF generado para ${selectedQuotation.codigo}`)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors">
            Generar PDF
          </button>
          <button type="button" onClick={() => setSelectedQuotation(null)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors">
            Cerrar visualización
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr] mt-6">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Estructura Comercial</div>
          <div className="grid gap-2 text-xs text-slate-700">
            <div className="flex justify-between"><span className="text-slate-400 font-medium">Razón Social / Cliente</span><span className="font-semibold">{selectedQuotation.cliente?.razonSocial || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 font-medium">Liquidación total</span><span className="font-bold text-[#5680F9] font-mono">{formatCurrency(selectedQuotation.montoTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 font-medium">Descuento</span><span className="font-semibold font-mono">{selectedQuotation.descuento}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400 font-medium">Viáticos</span><span className="font-semibold font-mono">{formatCurrency(selectedQuotation.viaticos)}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Detalle de Ítems</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {selectedQuotation.detalles?.map((det) => (
              <div key={det.idDetalle} className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex justify-between">
                <span>{det.equipoDescripcion} ({det.magnitud})</span>
                <span className="font-mono font-bold">{formatCurrency(Number(det.valorTotal))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sección de historial de estados */}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pipeline de cotizacion</div>
        <TimelineHistorial items={historial}loading={loadingHistorial} />
      </div>
    </div>
  );
};
// ==========================================
// Wizard de creación
// ==========================================
const CreateQuotationWizard = ({
  step,
  setStep,
  items,
  agregarFila,
  eliminarFila,
  manejarCambioFila,
  descuento,
  setDescuento,
  viaticos,
  setViaticos,
  calculateTotal,
  formatCurrency,
  showToast,
  setView,
  guardarCotizacion,
  isSaving,
  idClienteSeleccionado,
  setIdClienteSeleccionado,
  tarifasOptions,
  getMagnitudesByTipo,
  getInstrumentosByMagnitudAndTipo,
}: CreateQuotationWizardProps) => {
  const clientes = useDbTable("clientes");
  const [search, setSearch] = useState<string>("");

  const filteredClientes: ClienteModel[] = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return clientes || [];
    return (clientes || []).filter((c) =>
      (c.razonSocial?.toLowerCase() || "").includes(normalizedSearch) ||
      (c.nitCedula || "").includes(normalizedSearch)
    );
  }, [search, clientes]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden animate-in fade-in duration-150">
      <div className="flex px-6 py-5 border-b border-slate-100 bg-slate-50/30 overflow-x-auto">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2 mr-6 last:mr-0 flex-shrink-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step >= s ? "bg-[#5680F9] text-white shadow-[0_2px_6px_rgba(86,128,249,0.3)]" : "bg-slate-200 text-slate-400"}`}>
              {s}
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${step >= s ? "text-slate-700" : "text-slate-400"}`}>
              {["Cliente", "Formulario"][s - 1]}
            </span>
            {s < 2 && <div className="mx-2 h-[1px] bg-slate-200 w-8" />}
          </div>
        ))}
      </div>

      <div className="p-6">
        {step === 1 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Seleccionar cliente *</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por razón social o NIT..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium placeholder:text-slate-400 outline-none focus:border-[#5680F9] focus:ring-2 focus:ring-[#5680F9]/10 mb-3"
            />
            <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl max-h-48 overflow-y-auto space-y-1">
              {filteredClientes.length === 0 ? (
                <div className="py-2 px-3 text-slate-400 text-xs">No se encontraron clientes</div>
              ) : (
                filteredClientes.map((c: ClienteModel) => (
                  <div
                    key={c.idCliente}
                    onClick={() => setIdClienteSeleccionado(c.idCliente)}
                    className={`py-2.5 px-3 rounded-lg cursor-pointer transition-colors text-xs font-medium ${
                      idClienteSeleccionado === c.idCliente ? "bg-blue-100 text-[#5680F9] font-bold" : "text-slate-600 hover:bg-blue-50/50"
                    }`}
                  >
                    {c.razonSocial} — {c.nitCedula}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6 w-full max-w-6.5xl mx-auto p-2">
            <button onClick={() => agregarFila("create")} className="w-36 h-10 self-end bg-white text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm font-bold text-xs transition-all">
              Agregar items
            </button>

            <ItemsTable
              itemsList={items}
              target="create"
              manejarCambioFila={manejarCambioFila}
              eliminarFila={eliminarFila}
              tarifasOptions={tarifasOptions}
              getMagnitudesByTipo={getMagnitudesByTipo}
              getInstrumentosByMagnitudAndTipo={getInstrumentosByMagnitudAndTipo}
            />

            <div className="w-full max-w-md self-end bg-slate-50 border border-slate-100 rounded-2xl p-5 mt-2">
              <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200/60">Resumen de liquidación</h3>
              <div className="space-y-3 text-xs text-slate-600 mb-4">
                <div className="flex justify-between items-center"><span className="font-medium text-slate-500">Total ítems:</span><span className="font-bold text-slate-700 font-mono">{items.length}</span></div>
                <div className="flex justify-between items-center gap-4 py-1">
                  <span className="font-medium text-slate-500">Descuento comercial:</span>
                  <select value={descuento} onChange={(e) => setDescuento(Number(e.target.value))} className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none">
                    <option value={0}>0 %</option>
                    <option value={10}>10 %</option>
                    <option value={15}>15 %</option>
                    <option value={20}>20 %</option>
                  </select>
                </div>
                <div className="flex justify-between items-center gap-4 py-1">
                  <span className="font-medium text-slate-500">Viáticos de campo:</span>
                  <input type="number" min="0" value={viaticos} onChange={(e) => setViaticos(parseFloat(e.target.value) || 0)} className="w-28 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-right font-mono outline-none"/>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800">Valor total:</span>
                <span className="text-base font-black text-[#5680F9] font-mono">{formatCurrency(calculateTotal(items, descuento, viaticos))}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/30">
        {step > 1 && (
          <button onClick={() => setStep((s) => s - 1)} disabled={isSaving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white text-xs font-bold hover:bg-slate-50 transition-colors">
            Anterior
          </button>
        )}
        <button onClick={() => setView("list")} disabled={isSaving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white text-xs font-bold hover:bg-slate-50 transition-colors">
          Cancelar
        </button>
        {step <= 1 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!idClienteSeleccionado} className="px-5 py-2.5 rounded-xl bg-[#5680F9] text-white text-xs font-bold border-none hover:bg-[#4069E2] shadow-[0_2px_8px_rgba(86,128,249,0.25)] disabled:opacity-50">
            Siguiente
          </button>
        ) : (
   <div className="flex gap-3">
  <button
    onClick={() => guardarCotizacion(Estados.BORRADOR)}
    disabled={isSaving || items.length === 0}
    className="px-5 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold border-none hover:bg-slate-300 transition-colors disabled:opacity-50"
  >
    {isSaving ? "Guardando..." : "Guardar como borrador"}
  </button>
  <button
    onClick={() => guardarCotizacion(Estados.ENVIADA)}
    disabled={isSaving || items.length === 0}
    className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold border-none hover:bg-emerald-600 shadow-[0_2px_8px_rgba(16,185,129,0.25)] disabled:opacity-50"
  >
    {isSaving ? "Enviando..." : "Enviar cotización"}
  </button>
</div>
        )}
      </div>
    </div>
  );
};
import { ModalHistorialCambiosProps } from "@/tipos/cotizacion";
export const ModalHistorialCambios: React.FC<ModalHistorialCambiosProps> = ({
  isOpen,
  onClose,
  codigo_cotizacion,
  historial,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
        
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Historial de Cambios e Inmutabilidad
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Cotización : #{codigo_cotizacion}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo / Tabla Inmutable */}
        <div className="overflow-x-auto flex-1 rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Versión</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3">Descripción</th>
                <th className="py-3 px-3 text-center">Req. H. Life</th>
                <th className="py-3 px-3">Aprobó</th>
                <th className="py-3 px-3">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                    Cargando trazabilidad del historial...
                  </td>
                </tr>
              ) : historial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                    No hay registros de cambios asociados a esta cotización.
                  </td>
                </tr>
              ) : (
                historial.map((registro) => (
                  <tr key={registro.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                      v{registro.numeroVersion}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {new Date(registro.fechaCambio).toLocaleDateString("es-CO", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                      {registro.descripcion}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          registro.requiereValidacionHoja
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {registro.requiereValidacionHoja ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                      {registro.aprobo}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-xs italic max-w-xs truncate">
                      {registro.observaciones || "N/A"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pie del Modal */}
        <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-4">
          <span className="text-xs text-slate-400 font-mono">
            Registros inmutables auditados por el sistema
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

import { obtenerUsuariosPorPermiso } from "@/app/action_module/administration";
import { HistorialCambioItem } from "@/tipos/cotizacion";
export default function Cotizaciones() {

  const cotizacionesStore = useDbTable("cotizaciones") as unknown as CotizacionVista[];
  const usuarios = useDbTable("usuarios");
  const tarifasStore = useDbTable("tarifas");
  const loadingCotizaciones = useDbLoading("cotizaciones");
  const { setDbState, loadTable } = useDbActions();

  const [view, setView] = useState<ViewCotizacion>("list");
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("Todos");
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [idClienteSeleccionado, setIdClienteSeleccionado] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [descuento, setDescuento] = useState<number>(0);
  const [viaticos, setViaticos] = useState<number>(0);
  const [selectedQuotation, setSelectedQuotation] = useState<CotizacionVista | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<QuoteItem[]>([]);
  const [modalDescuento, setModalDescuento] = useState<number>(0);
  const [modalViaticos, setModalViaticos] = useState<number>(0);
  const [toast, setToast] = useState("");
  const roles=useDbTable("roles");
  const [isOpenTable,setOpenTable]=useState(false)

    const rolesMap = useMemo(() => {
      const map = new Map<number, string>();
      roles?.forEach((r) => map.set(Number(r.idRol), r.nombreRol));
      return map;
    }, [roles]);
  // ==========================================
  // FUNCIONES DE CARGA DESDE EL SERVIDOR
  // ==========================================
  const formatCurrency = (value: number) =>
    value.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ==========================================
  // FUNCIONES DE CARGA DESDE EL SERVIDOR
  // ==========================================
  const cargarCotizaciones = useCallback(async () => {
    const response = await obtenerTodasLasCotizaciones();
    if (response.ok && Array.isArray(response.data)) {
      const parse_data: CotizacionVista[] = response.data.map((c) => ({
        idCotizacion: c.idCotizacion,
        codigo: c.codigo,
        idCliente: c.idCliente,
        montoTotal: Number(c.montoTotal ?? 0),
        estado: c.estado,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        viaticos: Number(c.viaticos ?? 0),
        descuento: Number(c.descuento ?? 0),
        detalles: (c.detalles ?? []).map((d) => ({
          idDetalle: d.idDetalle,
          idCotizacion: d.idCotizacion,
          equipoDescripcion: d.equipoDescripcion,
          tipoServicio: d.tipoServicio,
          magnitud: d.magnitud,
          normaTecnica: d.normaTecnica,
          cantidad: d.cantidad,
          valorUnitario: Number(d.valorUnitario),
          valorTotal: Number(d.valorTotal),
          sitio: d.sitio ?? null,
        })),
        cliente: {
          idCliente: c.idCliente,
          razonSocial: c.cliente?.razonSocial ?? null,
          correo: c.cliente?.correo ?? null,
        },
        historialEstados: c.historialEstados,
        historial_cambio:c.Historiacambios,
        
      }));

      setDbState((prev) => ({
        ...prev,
        cotizaciones: parse_data as unknown as CotizacionModel[],
      }));
    }
  }, [setDbState]);

  // Tarifas derivadas del store (sin estado local ni fallback mock)
  const tarifasOptions: TarifaOption[] = useMemo(() => {
    return (tarifasStore ?? []).map((t) => {
      const historial = t.historial || [];
      const activo = historial.find((h) => !h.fechaFin) || historial[0];
      const precio = activo ? Number(activo.precioU) : 0;
      return {
        tipoServicio: t.tipoServicio || "ACREDITADO",
        magnitud: t.magnitud || "",
        instrumento: t.Instrumento || "Genérico",
        norma: t.Norma || "N/A",
        precio,
      };
    });
  }, [tarifasStore]);

  // ==========================================
  // EFECTO INICIAL
  // ==========================================
  useEffect(() => {
    cargarCotizaciones();
    loadTable("tarifas");
    loadTable("clientes");
    loadTable("usuarios");

  }, [cargarCotizaciones, loadTable]);

  // ==========================================
  // FUNCIONES DE FILTRO PARA TARIFAS
  // ==========================================
  const getMagnitudesByTipo = useCallback((tipo: string): string[] => {
    const unique = new Set<string>();
    tarifasOptions.forEach((t) => {
      if (t.tipoServicio === tipo) unique.add(t.magnitud);
    });
    return Array.from(unique).filter(Boolean);
  }, [tarifasOptions]);

  const getInstrumentosByMagnitudAndTipo = useCallback((magnitud: string, tipo: string): TarifaOption[] => {
    return tarifasOptions.filter(
      (t) => t.magnitud === magnitud && t.tipoServicio === tipo
    );
  }, [tarifasOptions]);

  // ==========================================
  // MANEJADORES
  // ==========================================
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const handleNuevaCotizacion = useCallback(() => {
    setItems([]);
    setView("create");
    setStep(1);
    setIdClienteSeleccionado(null);
  }, []);

  const openVersionModal = useCallback(() => {
    if (!selectedQuotation) return;
    const mapeados = (selectedQuotation.detalles || []).map((d: CotizacionDetalleVista) => ({
      id: d.idDetalle,
      tipoServicio: d.tipoServicio,
      magnitud: d.magnitud,
      instrumento: d.equipoDescripcion,
      norma: d.normaTecnica || "N/A",
      cantidad: d.cantidad,
      valorUnitario: Number(d.valorUnitario),
      lugarCalibracion: (d.sitio || "Laboratorio") as QuoteItem["lugarCalibracion"],
    }));
    setModalItems(mapeados);
    setModalDescuento(selectedQuotation.descuento || 0);
    setModalViaticos(selectedQuotation.viaticos || 0);
    setIsVersionModalOpen(true);
  }, [selectedQuotation]);

  const calculateTotal = useCallback((listaItems: QuoteItem[], desc: number, viat: number) => {
    const subtotal = listaItems.reduce((acc, item) => acc + item.cantidad * item.valorUnitario, 0);
    return (subtotal + viat) * (1 - desc / 100);
  }, []);

  const guardarCotizacion = useCallback(async (estado: Estados) => {
    if (!idClienteSeleccionado) return;
    setIsSaving(true);
    try {
      const res = await crearCotizacion({
        codigo: `COT-${Date.now().toString().slice(-5)}`,
        idCliente: idClienteSeleccionado,
        viaticos,
        descuento,
        estado,
        detalles: items.map((i) => ({
          equipoDescripcion: i.instrumento,
          tipoServicio: i.tipoServicio,
          magnitud: i.magnitud,
          normaTecnica: i.norma,
          cantidad: i.cantidad,
          valorUnitario: i.valorUnitario,
        })),
      });

      if (res.ok) {
        showToast(`✅ Cotización guardada como ${estado}`);
        setView("list");
        setStep(1);
        setItems([]);
        setIdClienteSeleccionado(null);
        cargarCotizaciones(); // refrescar lista
      } else {
        showToast(`❌ Error: ${res.error}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [idClienteSeleccionado, viaticos, descuento, items, showToast, cargarCotizaciones]);

  const handleEstadoChange = useCallback(async (id: number, nuevoEstado: Estados) => {
    setUpdatingId(id);
    try {
      const res = await cambiarEstadoCotizacion(id, nuevoEstado);
      if (res.ok) {
        showToast(`✅ Estado actualizado a ${nuevoEstado}`);
        cargarCotizaciones(); // refrescar para obtener historial actualizado
      } else {
        showToast(`❌ Error: ${res.error}`);
      }
    } finally {
      setUpdatingId(null);
    }
  }, [showToast, cargarCotizaciones]);

  const saveNewVersion = useCallback(async (_auditForm: cambiospayload) => {
    if (!selectedQuotation) return;
    setIsSaving(true);
    try {
      const res = await actualizarCotizacion({
        idCotizacion: selectedQuotation.idCotizacion,
        viaticos: modalViaticos,
        descuento: modalDescuento,
        detalles: modalItems.map((i) => ({
          equipoDescripcion: i.instrumento,
          tipoServicio: i.tipoServicio,
          magnitud: i.magnitud,
          normaTecnica: i.norma,
          cantidad: i.cantidad,
          valorUnitario: i.valorUnitario,
        })),
      });

      if (res.ok) {
        showToast(`✅ Versión actualizada para cotización #${selectedQuotation.codigo}`);
        setIsVersionModalOpen(false);
        setSelectedQuotation(null);
        cargarCotizaciones();
      } else {
        showToast(`❌ Error al actualizar: ${res.error}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [selectedQuotation, modalViaticos, modalDescuento, modalItems, showToast, cargarCotizaciones]);

  const agregarFila = useCallback((target: "create" | "modal") => {
    const nuevaFila: QuoteItem = {
      id: Date.now() + Math.random(),
      tipoServicio: "",
      magnitud: "",
      instrumento: "",
      norma: "N/A",
      cantidad: 1,
      valorUnitario: 0,
      lugarCalibracion: "Laboratorio",
    };
    if (target === "create") setItems((prev) => [...prev, nuevaFila]);
    else setModalItems((prev) => [...prev, nuevaFila]);
  }, []);

  const eliminarFila = useCallback((idParaEliminar: number, target: "create" | "modal") => {
    if (target === "create") setItems((prev) => prev.filter((f) => f.id !== idParaEliminar));
    else setModalItems((prev) => prev.filter((f) => f.id !== idParaEliminar));
  }, []);

const manejarCambioFila = useCallback(<K extends keyof QuoteItem>(
  index: number,
  propiedad: K,
  valor: QuoteItem[K],
  target: "create" | "modal"
) => {
  const listaOrigen = target === "create" ? items : modalItems;
  const filasActualizadas = [...listaOrigen];
  const fila = { ...filasActualizadas[index] };

  if (propiedad === "tipoServicio") {
    fila.tipoServicio = valor as string;
    fila.magnitud = "";
    fila.instrumento = "";
    fila.norma = "N/A";
    fila.valorUnitario = 0;
  } else if (propiedad === "magnitud") {
    fila.magnitud = valor as string;
    fila.instrumento = "";
    fila.norma = "N/A";
    fila.valorUnitario = 0;
    if (valor === "Temperatura" || valor === "Humedad") {
      fila.lugarCalibracion = "Laboratorio";
    }
  } else if (propiedad === "instrumento") {
    fila.instrumento = valor as string;
    const tarifaEncontrada = tarifasOptions.find(
      (t) =>
        t.instrumento === valor &&
        t.magnitud === fila.magnitud &&
        t.tipoServicio === fila.tipoServicio
    );
    if (tarifaEncontrada) {
      fila.norma = tarifaEncontrada.norma;
      fila.valorUnitario = tarifaEncontrada.precio;
    } else {
      fila.norma = "N/A";
      fila.valorUnitario = 0;
    }
  } else {
    // 👈 Solución: Mutamos directamente el borrador 'fila'
    fila[propiedad] = valor;
  }

  // 👈 Asignación limpia del borrador actualizado
  filasActualizadas[index] = fila;

  if (target === "create") setItems(filasActualizadas);
  else setModalItems(filasActualizadas);
}, [items, modalItems, tarifasOptions]);

  // ==========================================
  // DATOS DERIVADOS (useMemo)
  // ==========================================

  // Lista filtrada según búsqueda y estado
  const filtered: CotizacionVista[] = useMemo(() => {
    return (cotizacionesStore || []).filter((c) => {
      const matchSearch = !search ||
        c.codigo.toLowerCase().includes(search.toLowerCase()) ||
        (c.cliente?.razonSocial && c.cliente.razonSocial.toLowerCase().includes(search.toLowerCase()));
      const matchFilter = filterEstado === "Todos" || c.estado === filterEstado;
      return matchSearch && matchFilter;
    });
  }, [cotizacionesStore, search, filterEstado]);

  // Historial formateado para la cotización seleccionada (para Timeline)
  const historialFormateado: HistorialItem[] = useMemo(() => {
    if (!selectedQuotation?.historialEstados) return [];

    return selectedQuotation.historialEstados.map((h: HistorialEstadoCotizacionModel) => {
      console.log("entroo aqui ")
      console.log(h.idUsuario)
      const usuario = usuarios?.find((e) => e.idUsuario === h.idUsuario);
      console.log(usuario)
      return {
        id: h.id,
        estadoAnterior: h.estadoAnterior ?? null,
        estadoNuevo: h.estadoNuevo,
        idUsuario: h.idUsuario,
        createdAt: h.createdAt,
        usuario: usuario
          ? { nombreCompleto: usuario.nombreCompleto }
          : undefined,
      };
    });
  }, [selectedQuotation, usuarios]);
  const {data:sesion}=useSession()
  const nombre_ROL=useMemo(()=>{
    if(!isVersionModalOpen) return null ;
    return `${sesion?.user?.name}/${sesion?.user.role}`
  },[isVersionModalOpen])

  // ==========================================
  // RENDER
  // ==========================================


const historial_talble: HistorialCambioItem[] = useMemo(() => {
  // 1. Retornamos un arreglo vacío en lugar de 'null' para cumplir con el tipo HistorialCambioItem[]
  if (!isOpenTable) return [];

  // 2. flatMap aplanarás los arrays de historial_cambio de todas las cotizaciones
  return cotizacionesStore.flatMap((cotizacion) => {
    return (cotizacion.historial_cambio || []).map((item): HistorialCambioItem => ({
      id: item.id,
      numeroVersion: item.numeroVersion,
      fechaCambio: item.fechaCambio,
      descripcion: item.descripcion,
      requiereValidacionHoja: item.requiereValidacionHoja,
      observaciones: item.observaciones ?? null,
      aprobo: item.aprobo,
      idCotizacion: cotizacion.idCotizacion, // O item.idCotizacion si ya viene dentro del item
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  });
}, [isOpenTable, cotizacionesStore]);
  return (
    <div className="module-page" style={{ position: "relative" }}>
      <ToastNotification toast={toast} />

      <VersionModal
         usu_rol={nombre_ROL??"no hay"}
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        modalItems={modalItems}
        modalDescuento={modalDescuento}
        setModalDescuento={setModalDescuento}
        modalViaticos={modalViaticos}
        setModalViaticos={setModalViaticos}
        agregarFila={agregarFila}
        eliminarFila={eliminarFila}
        manejarCambioFila={manejarCambioFila}
        calculateTotal={calculateTotal}
        formatCurrency={formatCurrency}
        saveNewVersion={saveNewVersion}
        isSaving={isSaving}
        tarifasOptions={tarifasOptions}
        getMagnitudesByTipo={getMagnitudesByTipo}
        getInstrumentosByMagnitudAndTipo={getInstrumentosByMagnitudAndTipo}
              
      />

      <HeaderBar
        view={view}
        setView={setView}
        setStep={setStep}
        onNewQuote={handleNuevaCotizacion}
      />

      {view === "list" && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-56">
              <Search size={15} color="#9CA3AF" className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cotización..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-medium placeholder:text-slate-400 outline-none transition focus:border-[#5680F9] focus:ring-2 focus:ring-[#5680F9]/10"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["Todos", ...Object.values(Estados)].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterEstado(f)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    filterEstado === f
                      ? "bg-[#5680F9] border-[#5680F9] text-[#FFF] shadow-[0_2px_8px_rgba(86,128,249,0.25)]"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <QuotationListTable
            filtered={filtered}
            setSelectedQuotation={setSelectedQuotation}
            formatCurrency={formatCurrency}
            onEstadoChange={handleEstadoChange}
            updatingId={updatingId}
          />

          {selectedQuotation && (
            <QuotationDetailView
            onopentable={()=>setOpenTable(true)}
              selectedQuotation={selectedQuotation}
              openVersionModal={openVersionModal}
              showToast={showToast}
              setSelectedQuotation={setSelectedQuotation}
              formatCurrency={formatCurrency}
              historialitems={historialFormateado}
              loadingHistorial={loadingCotizaciones}
          
            />
          )}
        </>
      )}

      {view === "create" && (
        <CreateQuotationWizard
          step={step}
          setStep={setStep}
          items={items}
          agregarFila={agregarFila}
          eliminarFila={eliminarFila}
          manejarCambioFila={manejarCambioFila}
          descuento={descuento}
          setDescuento={setDescuento}
          viaticos={viaticos}
          setViaticos={setViaticos}
          calculateTotal={calculateTotal}
          formatCurrency={formatCurrency}
          showToast={showToast}
          setView={setView}
          guardarCotizacion={guardarCotizacion}
          isSaving={isSaving}
          idClienteSeleccionado={idClienteSeleccionado}
          setIdClienteSeleccionado={setIdClienteSeleccionado}
          tarifasOptions={tarifasOptions}
          getMagnitudesByTipo={getMagnitudesByTipo}
          getInstrumentosByMagnitudAndTipo={getInstrumentosByMagnitudAndTipo}
        />
      )}

      {view === "catalog" && <CatalogTableView />}
      <ModalHistorialCambios codigo_cotizacion={selectedQuotation?.codigo??""}historial={historial_talble} isOpen={isOpenTable}onClose={()=>setOpenTable(false)} />

      <AiAgentWidget activeContext={selectedQuotation} />
    </div>
  );
}