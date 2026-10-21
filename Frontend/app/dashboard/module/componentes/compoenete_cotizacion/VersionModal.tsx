'use client';

import React, { useMemo, useState } from "react";
import { X, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type {
  QuoteItem,
  TarifaOption,
  cambiospayload,
  ItemsTableProps,
  VersionModalProps,
} from "@/tipos/cotizacion";

const SELECT_CLASS = "w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:border-[#5680F9] outline-none disabled:bg-slate-50";

export const ItemsTable = ({
  itemsList,
  target,
  manejarCambioFila,
  eliminarFila,
  tarifasOptions,
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
                    value={fila.cantidad === 0 ? "" : fila.cantidad}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      const valorValido = val === "" ? 0 : parseInt(val, 10);
                      manejarCambioFila(index, "cantidad", valorValido, target);
                    }}
                    onBlur={() => {
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
                    readOnly
                    tabIndex={-1}
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
  const [step, setStep] = useState<'EDIT' | 'CONFIRM_VERSION'>('EDIT');

  const [auditForm, setAuditForm] = useState<cambiospayload>({
    descripcion: '',
    aprobo: usu_rol,
    observaciones: '',
  });

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('EDIT');
    setAuditForm({ descripcion: '', aprobo: usu_rol, observaciones: '' });
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
