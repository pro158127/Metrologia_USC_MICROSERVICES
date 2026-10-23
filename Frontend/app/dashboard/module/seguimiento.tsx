'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Plus, Trash2, Phone, Mail, Users, CalendarClock } from "lucide-react";
import { useDbTable, useDbLoading, useDbActions } from "@/app/componets/tables_recharge";
import { Estados } from "@/tipos/enums";
import type { CotizacionModel, SeguimientoComercialModel } from "@/tipos/entidades";
import { TIPOS_SEGUIMIENTO, type TipoSeguimiento } from "@/tipos/seguimiento";
import {
  crearSeguimiento,
  eliminarSeguimiento,
} from "@/app/action_module/seguimiento";
import { useSession } from "next-auth/react";

const tipoIcono: Record<string, React.ReactNode> = {
  LLAMADA: <Phone size={13} />,
  CORREO: <Mail size={13} />,
  REUNION: <Users size={13} />,
  OTRO: <CalendarClock size={13} />,
};

const formatoFecha = (v: Date | string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function SeguimientoComercial() {
  const cotizaciones = useDbTable("cotizaciones") as unknown as CotizacionModel[];
  const seguimientos = useDbTable("seguimientos_comerciales") as unknown as SeguimientoComercialModel[];
  const { loadTable } = useDbActions();
  const loading = useDbLoading("cotizaciones");
  const { data: session } = useSession();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    tipo: "LLAMADA" as TipoSeguimiento,
    descripcion: "",
    proximaGestion: "",
    resultado: "",
  });
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<SeguimientoComercialModel[]>([]);

  useEffect(() => {
    loadTable("cotizaciones");
    loadTable("seguimientos_comerciales");
  }, [loadTable]);

  const enSeguimiento = useMemo(() => {
    return (cotizaciones ?? []).filter((c) => c.estado === Estados.EN_SEGUIMIENTO);
  }, [cotizaciones]);

  const filtered = useMemo(() => {
    return enSeguimiento.filter(
      (c) =>
        !search ||
        (c.codigo ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (c.cliente?.razonSocial ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }, [enSeguimiento, search]);

  const seguimientosDeCotizacion = useMemo(() => {
    if (!selectedId) return [];
    const base = seguimientos.filter((s) => s.idCotizacion === selectedId);
    const extras = local.filter((s) => s.idCotizacion === selectedId);
    return [...extras, ...base].sort(
      (a, b) => new Date(b.fechaGestion).getTime() - new Date(a.fechaGestion).getTime()
    );
  }, [selectedId, seguimientos, local]);

  const cotizacionSeleccionada = useMemo(
    () => enSeguimiento.find((c) => c.idCotizacion === selectedId) ?? null,
    [enSeguimiento, selectedId]
  );

  const agregarSeguimiento = useCallback(async () => {
    if (!selectedId || !form.descripcion.trim()) return;
    setSaving(true);
    try {
      const idUsuario = session?.user?.id_user ? Number(session.user.id_user) : null;
      const res = await crearSeguimiento({
        idCotizacion: selectedId,
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        proximaGestion: form.proximaGestion ? new Date(form.proximaGestion) : null,
        resultado: form.resultado.trim() || null,
        idUsuario,
      });
      if (res.ok) {
        setLocal((prev) => [res.data, ...prev]);
        setForm({ tipo: "LLAMADA", descripcion: "", proximaGestion: "", resultado: "" });
      }
    } finally {
      setSaving(false);
    }
  }, [selectedId, form, session]);

  const borrarSeguimiento = useCallback(async (id: number) => {
    try {
      await eliminarSeguimiento(id);
      setLocal((prev) => prev.filter((s) => s.idSeguimiento !== id));
    } catch (error) {
      console.error(error);
    }
  }, []);

  return (
    <div className="w-full p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search size={15} color="#9CA3AF" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cotización en seguimiento..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs outline-none focus:border-[#5680F9]"
          />
        </div>
        <span className="text-xs font-bold text-slate-500">{filtered.length} cotización(es)</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Lista de cotizaciones en seguimiento */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["N° Cotización", "Cliente", "Valor", "Enviada", "Acción"].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No hay cotizaciones en seguimiento.</td></tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.idCotizacion}
                    onClick={() => setSelectedId(c.idCotizacion)}
                    className={`cursor-pointer transition-colors ${selectedId === c.idCotizacion ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{c.codigo}</td>
                    <td className="px-4 py-3 text-slate-600">{c.cliente?.razonSocial || "N/A"}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {Number(c.montoTotal ?? 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatoFecha(c.updatedAt ?? c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">EN_SEGUIMIENTO</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Panel de gestión del seguimiento */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 flex flex-col gap-4">
          {!cotizacionSeleccionada ? (
            <div className="text-xs text-slate-400 text-center py-12">Selecciona una cotización para gestionar su seguimiento.</div>
          ) : (
            <>
              <div>
                <div className="text-sm font-bold text-slate-800">{cotizacionSeleccionada.codigo}</div>
                <div className="text-xs text-slate-500">{cotizacionSeleccionada.cliente?.razonSocial}</div>
              </div>

              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nueva gestión</div>
                <div className="flex gap-2">
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoSeguimiento })}
                    className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-[#5680F9]"
                  >
                    {TIPOS_SEGUIMIENTO.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={form.proximaGestion}
                    onChange={(e) => setForm({ ...form, proximaGestion: e.target.value })}
                    className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-[#5680F9]"
                  />
                </div>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={2}
                  placeholder="Descripción de la gestión..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-[#5680F9] resize-none"
                />
                <input
                  value={form.resultado}
                  onChange={(e) => setForm({ ...form, resultado: e.target.value })}
                  placeholder="Resultado (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-[#5680F9]"
                />
                <button
                  onClick={agregarSeguimiento}
                  disabled={saving || !form.descripcion.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#5680F9] text-white text-xs font-bold hover:bg-[#4069E2] disabled:opacity-50"
                >
                  <Plus size={14} /> {saving ? "Guardando..." : "Registrar gestión"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Historial de acciones</div>
                {seguimientosDeCotizacion.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6">Sin gestiones registradas.</div>
                ) : (
                  seguimientosDeCotizacion.map((s) => (
                    <div key={s.idSeguimiento} className="flex items-start gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                      <span className="mt-0.5 text-[#5680F9]">{tipoIcono[s.tipo] ?? tipoIcono.OTRO}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase text-[#5680F9]">{s.tipo}</span>
                          <span className="text-[10px] text-slate-400">{formatoFecha(s.fechaGestion)}</span>
                          {s.usuario && <span className="text-[10px] text-slate-500">· {s.usuario.nombreCompleto}</span>}
                        </div>
                        <p className="text-xs text-slate-700 mt-1">{s.descripcion}</p>
                        {s.resultado && <p className="text-[11px] text-slate-500 mt-0.5 italic">{s.resultado}</p>}
                        {s.proximaGestion && (
                          <p className="text-[10px] text-slate-400 mt-1">Próxima gestión: {formatoFecha(s.proximaGestion)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => borrarSeguimiento(s.idSeguimiento)}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
