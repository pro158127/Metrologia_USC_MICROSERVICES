// 1. Imports
import React, { useState } from "react";
import { Send, CheckCircle, Lock, Plus, X, FileText } from "lucide-react";

// Tipos e Interfaces
interface OTItem {
  id: string;
  cliente: string;
  correo: string;
  certs: number;
  valor: string;
  facturado: boolean;
  pagado: boolean;
}

interface HistorialItem {
  fecha: string;
  ots: string;
  correo: string;
  certs: number;
  estado: "enviado" | "error";
}

// Datos Iniciales Mock
const initialOTs: OTItem[] = [
  { id: "OT-2026-087", cliente: "Clínica del Sur IPS", correo: "compras@clinicasur.com", certs: 2, valor: "$1.420.000", facturado: false, pagado: false },
  { id: "OT-2026-085", cliente: "USC Ingeniería", correo: "laboratorio@usc.edu.co", certs: 1, valor: "$890.000", facturado: true, pagado: false },
  { id: "OT-2026-078", cliente: "Industrias Andinas S.A.", correo: "calidad@andinas.com.co", certs: 3, valor: "$3.350.000", facturado: false, pagado: false },
  { id: "OT-2026-071", cliente: "Empresa ABC S.A.S", correo: "gerencia@empresaabc.com", certs: 2, valor: "$2.100.000", facturado: true, pagado: false },
];

const initialHistorial: HistorialItem[] = [
  { fecha: "2026-06-08 15:30", ots: "OT-2026-065, OT-2026-066", correo: "cliente@empresa.com", certs: 4, estado: "enviado" },
  { fecha: "2026-06-07 11:20", ots: "OT-2026-060", correo: "gerencia@clinica.com", certs: 2, estado: "enviado" },
  { fecha: "2026-06-05 16:45", ots: "OT-2026-055", correo: "sistemas@andinas.com.co", certs: 3, estado: "error" },
];

// 2. Declaración de Componentes Hijos (Extraídos)

interface AlertBannerProps {
  count: number;
}

const AlertBanner: React.FC<AlertBannerProps> = ({ count }) => {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-center bg-orange-200 text-orange-900 py-2 mb-4 rounded">
      <span className="text-sm font-bold">⚠️ {count} OTs sin factura registrada</span>
    </div>
  );
};

interface ToastProps {
  message: string;
}

const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl max-w-sm bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

interface HeaderProps {
  selectedCount: number;
  totalCerts: number;
  onOpenSendPanel: () => void;
}

const Header: React.FC<HeaderProps> = ({ selectedCount, totalCerts, onOpenSendPanel }) => {
  return (
    <div className="flex items-center justify-between mb-6">
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

interface ColumnFacturadasProps {
  items: OTItem[];
  selectedIds: string[];
  onSelectDetail: (ot: OTItem) => void;
  onConfirmarPago: (id: string) => void;
}

const ColumnFacturadas: React.FC<ColumnFacturadasProps> = ({
  items,
  selectedIds,
  onSelectDetail,
  onConfirmarPago,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle size={15} className="text-emerald-500" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">OT facturadas</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((ot) => (
          <div
            key={ot.id}
            className="rounded-2xl p-4 transition-all bg-white border cursor-pointer hover:shadow-sm"
            style={{
              borderColor: selectedIds.includes(ot.id) ? "#5680F9" : "#E2E8F0",
              boxShadow: selectedIds.includes(ot.id)
                ? "0 4px 12px rgba(86,128,249,0.06)"
                : "0 2px 4px rgba(15,23,42,0.01)",
            }}
            onClick={() => onSelectDetail(ot)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#5680F9] font-mono">{ot.id}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold">
                ✓ Facturado
              </span>
            </div>
            <div className="text-xs font-bold text-slate-700 mb-1">{ot.cliente}</div>
            <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100/50">
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
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-emerald-700 transition-colors"
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

interface ColumnListasEnvioProps {
  items: OTItem[];
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
}

const ColumnListasEnvio: React.FC<ColumnListasEnvioProps> = ({
  items,
  selectedIds,
  onToggleSelected,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Send size={15} className="text-blue-500" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Listas para envío</span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((ot) => (
          <div
            key={ot.id}
            className="rounded-2xl p-4 bg-white border border-blue-200 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => onToggleSelected(ot.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#5680F9] font-mono">{ot.id}</span>
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold">
                ✓ PAGADO
              </span>
            </div>
            <div className="text-xs font-bold text-slate-700 mb-1">{ot.cliente}</div>
            <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 font-mono">{ot.valor}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                <FileText size={12} />
                {ot.certs} cert(s)
              </span>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelected(ot.id);
                }}
                className={`w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
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

interface ColumnSinFacturarProps {
  items: OTItem[];
  paymentSelector: string | null;
  selectedMethod: string;
  onSetPaymentSelector: (id: string | null) => void;
  onSetSelectedMethod: (method: string) => void;
  onConfirmarFactura: (id: string) => void;
}

const ColumnSinFacturar: React.FC<ColumnSinFacturarProps> = ({
  items,
  paymentSelector,
  selectedMethod,
  onSetPaymentSelector,
  onSetSelectedMethod,
  onConfirmarFactura,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Lock size={15} className="text-red-700" />
        <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Pendientes de factura</span>
        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((ot) => (
          <div key={ot.id} className="rounded-2xl p-4 bg-slate-50/50 border border-slate-200/60 opacity-80 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 font-mono">{ot.id}</span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold">
                <Lock size={10} /> Sin factura
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 mb-1">{ot.cliente}</div>
            <div className="text-[11px] text-slate-400">📧 {ot.correo}</div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-200/50">
              <span className="text-xs font-semibold text-slate-400 font-mono">
                {ot.valor} · {ot.certs} cert(s)
              </span>
              {paymentSelector === ot.id ? (
                <div className="flex items-center gap-2 bg-white p-2 border border-slate-200 rounded-lg">
                  <select
                    value={selectedMethod}
                    onChange={(e) => onSetSelectedMethod(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-sm"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Transferencia">Transferencia</option>
                  </select>
                  <button
                    onClick={() => onConfirmarFactura(ot.id)}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#5680F9] text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-[#4069E2] transition-colors"
                  >
                    Confirmar
                  </button>
                  <button onClick={() => onSetPaymentSelector(null)} className="text-slate-500 hover:text-slate-700">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSetPaymentSelector(ot.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[#5680F9] text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <CheckCircle size={12} /> Registrar factura
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface DetailPanelProps {
  detail: OTItem;
  email: string;
  cc: string;
  message: string;
  onSetEmail: (val: string) => void;
  onSetCC: (val: string) => void;
  onSetMessage: (val: string) => void;
  onSend: () => void;
  onClose: () => void;
}

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
}) => {
  return (
    <div className="mt-2 mb-6 rounded-2xl p-5 bg-white border border-slate-200 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-800 border-l-[3px] border-[#5680F9] pl-2">
          Detalle — {detail.id}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-transparent border-none cursor-pointer">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Correo del cliente
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => onSetEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            CC (opcional)
          </label>
          <input
            type="email"
            value={cc}
            onChange={(e) => onSetCC(e.target.value)}
            placeholder="cc@empresa.com"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mensaje</label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => onSetMessage(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#5680F9]"
        />
      </div>
      <div className="mb-5">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Certificados adjuntos
        </span>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: detail.certs }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-600"
            >
              <FileText size={12} className="text-[#5680F9]" />
              Certificado_{detail.id}_{i + 1}.pdf
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onSend}
          className="flex items-center gap-2 px-4 py-2 bg-[#5680F9] text-white text-xs font-bold rounded-xl hover:bg-[#4069E2] transition-colors"
        >
          <Send size={14} /> Enviar certificado por Outlook
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

interface SendPanelProps {
  selectedOTs: OTItem[];
  totalCerts: number;
  ccEmail: string;
  onSetCcEmail: (val: string) => void;
  onEnviar: () => void;
  onClose: () => void;
}

const SendPanel: React.FC<SendPanelProps> = ({
  selectedOTs,
  totalCerts,
  ccEmail,
  onSetCcEmail,
  onEnviar,
  onClose,
}) => {
  return (
    <div className="rounded-2xl p-5 mb-6 bg-white border-2 border-[#C7D2FE] shadow-[0_8px_30px_rgba(86,128,249,0.1)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider border-l-[3px] border-[#5680F9] pl-2">
          Panel de envío
        </span>
        <button onClick={onClose} className="bg-transparent border-none cursor-pointer">
          <X size={18} color="#94A3B8" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
            OT seleccionadas
          </div>
          <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
            {selectedOTs.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <span className="text-xs font-bold text-[#5680F9] font-mono">{o.id}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{o.certs} cert(s)</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 border-t border-slate-200/50 mt-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total</span>
            <span className="text-xs font-extrabold text-[#5680F9] font-mono">{totalCerts} certificados PDF</span>
          </div>
        </div>
        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Correos destino</div>
            <div className="divide-y divide-slate-100 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-600">
              {selectedOTs.map((o) => (
                <div key={o.id} className="py-2">📧 {o.correo}</div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Agregar CC (opcional)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={ccEmail}
                onChange={(e) => onSetCcEmail(e.target.value)}
                placeholder="cc@empresa.com"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium outline-none focus:border-[#5680F9]"
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
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#5680F9] text-white text-xs font-bold uppercase tracking-wider border-none cursor-pointer hover:bg-[#4069E2] transition-colors shadow-sm"
      >
        <Send size={16} /> Enviar certificados seleccionados
      </button>
    </div>
  );
};

interface HistoryTableProps {
  historial: HistorialItem[];
}

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
              <td className="px-4 py-3.5 text-slate-400 font-mono">{h.fecha}</td>
              <td className="px-4 py-3.5 text-[#5680F9] font-bold font-mono">{h.ots}</td>
              <td className="px-4 py-3.5 text-slate-500 font-mono truncate max-w-xs">{h.correo}</td>
              <td className="px-4 py-3.5 text-slate-700 font-semibold">{h.certs} cert(s)</td>
              <td className="px-4 py-3.5">
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

export function MainRenderer() {
  const [items, setItems] = useState<OTItem[]>(initialOTs);
  const [paymentSelector, setPaymentSelector] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("Efectivo");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<OTItem | null>(null);
  const [detailEmail, setDetailEmail] = useState<string>("");
  const [detailMessage, setDetailMessage] = useState<string>(
    "Estimado cliente, adjuntamos los certificados de calibración correspondientes a su orden de trabajo."
  );
  const [detailCC, setDetailCC] = useState<string>("");
  const [toast, setToast] = useState("");
  const [historial, setHistorial] = useState<HistorialItem[]>(initialHistorial);
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [ccEmail, setCcEmail] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const toggleFacturado = (id: string) =>
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, facturado: true } : o)));

  const confirmarPago = (id: string) => {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, pagado: true } : o)));
    showToast(`✅ Pago confirmado para ${id}`);
    setSelectedDetail(null);
  };

  const toggleSelected = (id: string) => {
    const ot = items.find((o) => o.id === id);
    if (!ot?.facturado || !ot?.pagado) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleConfirmarFactura = (id: string) => {
    toggleFacturado(id);
    showToast(`✅ ${id} registrada como facturada con ${selectedMethod}.`);
    setPaymentSelector(null);
  };

  const selectedOTs = items.filter((o) => selected.includes(o.id));
  const totalCerts = selectedOTs.reduce((acc, o) => acc + o.certs, 0);

  const handleEnviar = () => {
    if (selectedOTs.length === 0) return;
    const correos = [...new Set(selectedOTs.map((o) => o.correo))].join(", ");
    const newEntry: HistorialItem = {
      fecha: "2026-06-09 " + new Date().toTimeString().slice(0, 5),
      ots: selectedOTs.map((o) => o.id).join(", "),
      correo: correos + (ccEmail ? `, ${ccEmail}` : ""),
      certs: totalCerts,
      estado: "enviado",
    };
    setHistorial((prev) => [newEntry, ...prev]);
    showToast(`✅ Correo enviado a ${correos} con ${totalCerts} certificados adjuntos.`);
    setSelected([]);
    setShowSendPanel(false);
    setCcEmail("");
  };

  const facturadas = items.filter((o) => o.facturado && !o.pagado);
  const listasEnvio = items.filter((o) => o.facturado && o.pagado);
  const sinFacturar = items.filter((o) => !o.facturado);

  return (
    <div className="module-page" style={{ position: "relative" }}>
      <AlertBanner count={sinFacturar.length} />
      <Toast message={toast} />

      <Header
        selectedCount={selected.length}
        totalCerts={totalCerts}
        onOpenSendPanel={() => setShowSendPanel(true)}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
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
          onSetPaymentSelector={setPaymentSelector}
          onSetSelectedMethod={setSelectedMethod}
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
export default MainRenderer;