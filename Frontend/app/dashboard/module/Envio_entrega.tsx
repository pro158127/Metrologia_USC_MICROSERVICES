// 1. Imports
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Send, CheckCircle, Lock, Plus, X, FileText, Eye, Upload, Paperclip } from "lucide-react";
import type {
  OTItem,
  HistorialItem,
  AlertBannerProps,
  ToastProps,
  HeaderProps,
  ColumnFacturadasProps,
  ColumnListasEnvioProps,
  ColumnSinFacturarProps,
  DetailPanelProps,
  SendPanelProps,
  HistoryTableProps,
} from "@/tipos/envio";
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";

// ========== UTILIDADES DE FORMATO ==========
const formatValor = (val: number) => {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);
};

const formatFecha = (fecha: string | Date | null) => {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleString("es-CO");
};

// 2. Declaración de Componentes Hijos (Extraídos)

const AlertBanner: React.FC<AlertBannerProps> = ({ count }) => {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-center bg-orange-200 text-orange-900 py-2.5 mb-5 rounded-xl">
      <span className="text-sm font-bold">⚠️ {count} OTs sin factura registrada</span>
    </div>
  );
};

const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl max-w-sm bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({ selectedCount, totalCerts, onOpenSendPanel }) => {
  return (
    <div className="flex items-center justify-between mb-7">
      <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
        Entrega y Envío de Certificados
      </h1>
      {selectedCount > 0 && (
        <button
          onClick={onOpenSendPanel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5680F9] text-white text-xs font-bold border-none cursor-pointer hover:bg-[#4069E2] transition-colors shadow-[0_2px_8px_rgba(86,128,249,0.25)]"
        >
          <Send size={16} /> Enviar seleccionadas ({selectedCount} OT · {totalCerts} certs)
        </button>
      )}
    </div>
  );
};

const ColumnFacturadas: React.FC<ColumnFacturadasProps> = ({
  items,
  selectedIds,
  onSelectDetail,
  onConfirmarPago,
}) => {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle size={15} className="text-emerald-500" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">OT facturadas</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-4 max-h-[560px] overflow-y-auto pr-1 pb-1">
        {items.length === 0 && (
          <div className="text-[11px] text-slate-400 italic px-1 py-6 text-center border border-dashed border-slate-200 rounded-2xl">
            No hay OT en este estado.
          </div>
        )}
        {items.map((ot) => (
          <div
            key={ot.id}
            className="rounded-2xl p-5 transition-all bg-white border cursor-pointer hover:shadow-sm"
            style={{
              borderColor: selectedIds.includes(ot.id) ? "#5680F9" : "#E2E8F0",
              boxShadow: selectedIds.includes(ot.id)
                ? "0 4px 12px rgba(86,128,249,0.06)"
                : "0 2px 4px rgba(15,23,42,0.01)",
            }}
            onClick={() => onSelectDetail(ot)}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#5680F9] font-mono">{ot.id}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold">
                ✓ Facturado
              </span>
            </div>
            <div className="text-xs font-bold text-slate-700 mb-1.5">{ot.cliente}</div>
            <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100/70">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 font-mono">{ot.valor}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <FileText size={12} /> {ot.certs} cert(s)
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onConfirmarPago(ot.id);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-emerald-700 transition-colors"
              >
                Confirmar pago
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ColumnListasEnvio: React.FC<ColumnListasEnvioProps> = ({
  items,
  selectedIds,
  onToggleSelected,
}) => {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-4">
        <Send size={15} className="text-blue-500" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Listas para envío</span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-4 max-h-[560px] overflow-y-auto pr-1 pb-1">
        {items.length === 0 && (
          <div className="text-[11px] text-slate-400 italic px-1 py-6 text-center border border-dashed border-slate-200 rounded-2xl">
            No hay OT en este estado.
          </div>
        )}
        {items.map((ot) => (
          <div
            key={ot.id}
            className="rounded-2xl p-5 bg-white border border-blue-200 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => onToggleSelected(ot.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#5680F9] font-mono">{ot.id}</span>
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold">
                ✓ PAGADO
              </span>
            </div>
            <div className="text-xs font-bold text-slate-700 mb-1.5">{ot.cliente}</div>
            <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 font-mono">{ot.valor}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                <FileText size={12} />
                {ot.certs} cert(s)
              </span>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelected(ot.id);
                }}
                className={`w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  selectedIds.includes(ot.id)
                    ? "bg-green-600 text-white"
                    : "bg-[#5680F9] text-white hover:bg-[#4069E2]"
                }`}
              >
                {selectedIds.includes(ot.id) ? "✓ Seleccionada" : "Seleccionar para envío"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ColumnSinFacturar: React.FC<ColumnSinFacturarProps> = ({
  items,
  paymentSelector,
  selectedMethod,
  comprobantes,
  onSetPaymentSelector,
  onSetSelectedMethod,
  onUploadComprobante,
  onConfirmarFactura,
}) => {
  const handleFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadComprobante(id, file.name);
    }
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={15} className="text-red-700" />
        <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Pendientes de factura</span>
        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-4 max-h-[560px] overflow-y-auto pr-1 pb-1">
        {items.length === 0 && (
          <div className="text-[11px] text-slate-400 italic px-1 py-6 text-center border border-dashed border-slate-200 rounded-2xl">
            No hay OT en este estado.
          </div>
        )}
        {items.map((ot) => {
          const isEditing = paymentSelector === ot.id;
          const comprobanteNombre = comprobantes[ot.id];
          const puedeConfirmar = Boolean(selectedMethod) && Boolean(comprobanteNombre);

          return (
            <div key={ot.id} className="rounded-2xl p-5 bg-slate-50/50 border border-slate-200/60 opacity-90 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 font-mono">{ot.id}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold">
                  <Lock size={10} /> Sin factura
                </span>
              </div>
              <div className="text-xs font-bold text-slate-500 mb-1.5">{ot.cliente}</div>
              <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200/50">
                <span className="text-xs font-semibold text-slate-400 font-mono">
                  {ot.valor} · {ot.certs} cert(s)
                </span>
                {!isEditing && (
                  <button
                    onClick={() => onSetPaymentSelector(ot.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[#5680F9] text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <CheckCircle size={12} /> Registrar factura
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 flex flex-col gap-3 bg-white p-4 border border-slate-200 rounded-xl">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Método de pago
                    </label>
                    <select
                      value={selectedMethod}
                      onChange={(e) => onSetSelectedMethod(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs"
                    >
                      <option value="">Seleccione un método</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Transferencia">Transferencia</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Comprobante de pago (imagen o PDF)
                    </label>
                    <label
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed text-[11px] font-semibold cursor-pointer transition-colors ${
                        comprobanteNombre
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {comprobanteNombre ? (
                        <>
                          <Paperclip size={13} />
                          <span className="truncate">{comprobanteNombre}</span>
                        </>
                      ) : (
                        <>
                          <Upload size={13} />
                          <span>Subir comprobante</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleFileChange(ot.id, e)}
                      />
                    </label>
                    {!comprobanteNombre && (
                      <p className="text-[10px] text-red-500 mt-1.5">
                        Debes subir el comprobante para poder confirmar.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => onSetPaymentSelector(null)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                    >
                      <X size={13} /> Cancelar
                    </button>
                    <button
                      onClick={() => onConfirmarFactura(ot.id)}
                      disabled={!puedeConfirmar}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                        puedeConfirmar
                          ? "bg-[#5680F9] text-white cursor-pointer hover:bg-[#4069E2]"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      Confirmar
                    </button>
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

const DetailPanel: React.FC<DetailPanelProps> = ({
  detail,
  email,
  cc,
  message,
  onSetEmail,
  onSetCC,
  onSetMessage,
  onSend,
  onClose,
  onCertificadoPress,
}) => {
  return (
    <div className="mt-2 mb-7 rounded-2xl p-6 bg-white border border-slate-200 shadow-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-bold text-slate-800 border-l-[3px] border-[#5680F9] pl-2">
          Detalle — {detail.id}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-transparent border-none cursor-pointer">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Correo del cliente
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => onSetEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            CC (opcional)
          </label>
          <input
            type="email"
            value={cc}
            onChange={(e) => onSetCC(e.target.value)}
            placeholder="cc@empresa.com"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
          />
        </div>
      </div>
      <div className="mb-5">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mensaje</label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => onSetMessage(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
        />
      </div>
      <div className="mb-6">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
          Certificados adjuntos
        </span>
        <div className="flex flex-col gap-2">
          {Array.from({ length: detail.certs }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-600"
            >
              <span className="flex items-center gap-2">
                <FileText size={12} className="text-[#5680F9]" />
                Certificado_{detail.id}_{i + 1}.pdf
              </span>
              <button
                type="button"
                onClick={() => onCertificadoPress(detail.id, i + 1)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[#5680F9] text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <Eye size={12} /> Ver
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onSend}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#5680F9] text-white text-xs font-bold rounded-xl hover:bg-[#4069E2] transition-colors"
        >
          <Send size={14} /> Enviar certificado por Outlook
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

const SendPanel: React.FC<SendPanelProps> = ({
  selectedOTs,
  totalCerts,
  ccEmail,
  onSetCcEmail,
  onEnviar,
  onClose,
}) => {
  return (
    <div className="rounded-2xl p-6 mb-7 bg-white border-2 border-[#C7D2FE] shadow-[0_8px_30px_rgba(86,128,249,0.1)]">
      <div className="flex items-center justify-between mb-5">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider border-l-[3px] border-[#5680F9] pl-2">
          Panel de envío
        </span>
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer">
          <X size={18} color="#94A3B8" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            OT seleccionadas
          </div>
          <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
            {selectedOTs.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2.5">
                <span className="text-xs font-bold text-[#5680F9] font-mono">{o.id}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{o.certs} cert(s)</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3.5 border-t border-slate-200/50 mt-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total</span>
            <span className="text-xs font-extrabold text-[#5680F9] font-mono">{totalCerts} certificados PDF</span>
          </div>
        </div>
        <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Correos destino</div>
            <div className="divide-y divide-slate-100 max-h-28 overflow-y-auto font-mono text-[11px] text-slate-600">
              {selectedOTs.map((o) => (
                <div key={o.id} className="py-2.5">📧 {o.correo}</div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Agregar CC (opcional)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={ccEmail}
                onChange={(e) => onSetCcEmail(e.target.value)}
                placeholder="cc@empresa.com"
                className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 text-xs font-medium outline-none focus:border-[#5680F9]"
              />
              <button className="bg-transparent border-none cursor-pointer">
                <Plus size={14} color="#5680F9" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={onEnviar}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#5680F9] text-white text-xs font-bold uppercase tracking-wider border-none cursor-pointer hover:bg-[#4069E2] transition-colors shadow-sm"
      >
        <Send size={16} /> Enviar certificados seleccionados
      </button>
    </div>
  );
};

const HistoryTable: React.FC<HistoryTableProps> = ({ historial }) => {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider border-l-[3px] border-[#5680F9] pl-2">
          Historial de envíos
        </span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {["Fecha y hora", "OT enviadas", "Correo destino", "Certificados", "Estado"].map((h) => (
              <th key={h} className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {historial.map((h, i) => (
            <tr key={i} className="transition-colors hover:bg-slate-50/50 bg-white">
              <td className="px-4 py-4 text-slate-400 font-mono">{h.fecha}</td>
              <td className="px-4 py-4 text-[#5680F9] font-bold font-mono">{h.ots}</td>
              <td className="px-4 py-4 text-slate-500 font-mono truncate max-w-xs">{h.correo}</td>
              <td className="px-4 py-4 text-slate-700 font-semibold">{h.certs} cert(s)</td>
              <td className="px-4 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                    h.estado === "enviado"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-rose-50 text-rose-700 border-rose-100"
                  }`}
                >
                  {h.estado === "enviado" ? "✓ Enviado" : "✗ Error"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 3. Declaración del Componente Padre (MainRenderer)

export function MainRendererenv() {
  const ordenes = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const facturas = useDbTable("facturas");
  const usuarios = useDbTable("usuarios");
  const { loadTable } = useDbActions();

  useEffect(() => {
    loadTable("ordenes_trabajo");
    loadTable("clientes");
    loadTable("facturas");
    loadTable("usuarios");
  }, [loadTable]);

  const [paymentSelector, setPaymentSelector] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [comprobantes, setComprobantes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<OTItem | null>(null);
  const [detailEmail, setDetailEmail] = useState<string>("");
  const [detailMessage, setDetailMessage] = useState<string>(
    "Estimado cliente, adjuntamos los certificados de calibración correspondientes a su orden de trabajo."
  );
  const [detailCC, setDetailCC] = useState<string>("");
  const [toast, setToast] = useState("");
  const [historialExtra, setHistorialExtra] = useState<HistorialItem[]>([]);
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [ccEmail, setCcEmail] = useState("");

  const items = useMemo<OTItem[]>(() => {
    return ordenes
      .filter((ot) => ot.estado === "Certificado_enviado")
      .map((ot) => {
        const factura = facturas.find((f) => f.idOrdenTrabajo === ot.idOrdenTrabajo);
        return {
          id: ot.codigo,
          cliente: ot.cliente?.razonSocial ?? "",
          correo: ot.correoCertificado ?? ot.cliente?.correo ?? "",
          certs: ot.instrumentos?.length ?? 0,
          valor: formatValor(Number(factura?.valor ?? 0)),
          facturado: Boolean(factura),
          pagado: ot.estado_pago === "PAGADO",
        };
      });
  }, [ordenes, facturas, usuarios, clientes]);

  const historialBase = useMemo<HistorialItem[]>(() => {
    return ordenes
      .filter((ot) => ot.estado === "Certificado_enviado")
      .map((ot) => ({
        fecha: formatFecha(ot.createdAt),
        ots: ot.codigo,
        correo: ot.correoCertificado ?? ot.cliente?.correo ?? "",
        certs: ot.instrumentos?.length ?? 0,
        estado: "enviado" as const,
      }));
  }, [ordenes, usuarios]);

  const historial = useMemo<HistorialItem[]>(
    () => [...historialExtra, ...historialBase],
    [historialExtra, historialBase]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);

  const confirmarPago = useCallback((id: string) => {
    showToast(`✅ Pago confirmado para ${id}`);
    setSelectedDetail(null);
  }, [showToast]);

  const toggleSelected = useCallback((id: string) => {
    const ot = items.find((o) => o.id === id);
    if (!ot?.facturado || !ot?.pagado) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }, [items]);

  const handleUploadComprobante = useCallback((id: string, fileName: string) => {
    setComprobantes((prev) => ({ ...prev, [id]: fileName }));
  }, []);

  const handleCertificadoPress = useCallback((otId: string, certIndex: number) => {
    console.log("certificadoPress", { otId, certIndex });
  }, []);

  const handleConfirmarFactura = useCallback((id: string) => {
    if (!selectedMethod || !comprobantes[id]) {
      showToast("⚠️ Debes seleccionar el método de pago y subir el comprobante.");
      return;
    }
    showToast(`✅ ${id} registrada como facturada con ${selectedMethod} (comprobante: ${comprobantes[id]}).`);
    setPaymentSelector(null);
    setSelectedMethod("");
  }, [selectedMethod, comprobantes, showToast]);

  const selectedOTs = useMemo(() => items.filter((o) => selected.includes(o.id)), [items, selected]);
  const totalCerts = useMemo(() => selectedOTs.reduce((acc, o) => acc + o.certs, 0), [selectedOTs]);

  const handleEnviar = useCallback(() => {
    if (selectedOTs.length === 0) return;
    const correos = [...new Set(selectedOTs.map((o) => o.correo))].join(", ");
    const newEntry: HistorialItem = {
      fecha: new Date().toLocaleString("es-CO"),
      ots: selectedOTs.map((o) => o.id).join(", "),
      correo: correos + (ccEmail ? `, ${ccEmail}` : ""),
      certs: totalCerts,
      estado: "enviado",
    };
    setHistorialExtra((prev) => [newEntry, ...prev]);
    showToast(`✅ Correo enviado a ${correos} con ${totalCerts} certificados adjuntos.`);
    setSelected([]);
    setShowSendPanel(false);
    setCcEmail("");
  }, [selectedOTs, ccEmail, totalCerts, showToast]);

  const facturadas = useMemo(() => items.filter((o) => o.facturado && !o.pagado), [items]);
  const listasEnvio = useMemo(() => items.filter((o) => o.facturado && o.pagado), [items]);
  const sinFacturar = useMemo(() => items.filter((o) => !o.facturado), [items]);

  return (
    <div className="module-page" style={{ position: "relative" }}>
      <AlertBanner count={sinFacturar.length} />
      <Toast message={toast} />

      <Header
        selectedCount={selected.length}
        totalCerts={totalCerts}
        onOpenSendPanel={() => setShowSendPanel(true)}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-7">
        <ColumnFacturadas
          items={facturadas}
          selectedIds={selected}
          onSelectDetail={(ot) => {
            setSelectedDetail(ot);
            setDetailEmail(ot.correo);
            setDetailCC("");
            setDetailMessage(
              "Estimado cliente, adjuntamos los certificados de calibración correspondientes a su orden de trabajo."
            );
          }}
          onConfirmarPago={confirmarPago}
        />

        <ColumnListasEnvio
          items={listasEnvio}
          selectedIds={selected}
          onToggleSelected={toggleSelected}
        />

        <ColumnSinFacturar
          items={sinFacturar}
          paymentSelector={paymentSelector}
          selectedMethod={selectedMethod}
          comprobantes={comprobantes}
          onSetPaymentSelector={(id) => {
            setPaymentSelector(id);
            setSelectedMethod("");
          }}
          onSetSelectedMethod={setSelectedMethod}
          onUploadComprobante={handleUploadComprobante}
          onConfirmarFactura={handleConfirmarFactura}
        />
      </div>

      {selectedDetail && (
        <DetailPanel
          detail={selectedDetail}
          email={detailEmail}
          cc={detailCC}
          message={detailMessage}
          onSetEmail={setDetailEmail}
          onSetCC={setDetailCC}
          onSetMessage={setDetailMessage}
          onCertificadoPress={handleCertificadoPress}
          onSend={() => {
            showToast(`✅ Certificado enviado por Outlook para ${selectedDetail.id}`);
            setSelectedDetail(null);
          }}
          onClose={() => setSelectedDetail(null)}
        />
      )}

      {showSendPanel && (
        <SendPanel
          selectedOTs={selectedOTs}
          totalCerts={totalCerts}
          ccEmail={ccEmail}
          onSetCcEmail={setCcEmail}
          onEnviar={handleEnviar}
          onClose={() => setShowSendPanel(false)}
        />
      )}

      <HistoryTable historial={historial} />
    </div>
  );
}

// 4. Exportación por defecto
export default MainRendererenv;
