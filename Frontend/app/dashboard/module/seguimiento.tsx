'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Plus, Trash2, Phone, Mail, Users, CalendarClock, CheckCircle, XCircle, Pencil, X } from "lucide-react";
import { useDbTable, useDbActions, useRevisionTablas } from "@/app/componets/tables_recharge";
import { obtenerCotizacionesEnSeguimiento } from "@/app/action_module/cotizacion";
import { Estados } from "@/tipos/enums";
import type { CotizacionModel, SeguimientoComercialModel } from "@/tipos/entidades";
import { TIPOS_SEGUIMIENTO, type TipoSeguimiento } from "@/tipos/seguimiento";
import {
  crearSeguimiento,
  actualizarSeguimiento,
  eliminarSeguimiento,
} from "@/app/action_module/seguimiento";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import ResponsiveTable from "@/app/dashboard/components/ResponsiveTable";
import { useModuleSplashReady } from "@/app/dashboard/components/PageLoadSplash";

const tipoIcono: Record<string, React.ReactNode> = {
  LLAMADA: <Phone size={13} />,
  CORREO: <Mail size={13} />,
  REUNION: <Users size={13} />,
  OTRO: <CalendarClock size={13} />,
  PAGO: <CheckCircle size={13} />,
  RECHAZO: <XCircle size={13} />,
};

const formatoFecha = (v: Date | string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fechaParaInput = (v: Date | string) => new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Bogota",
}).format(new Date(v));

function origenSeguimiento(cotizacion: CotizacionModel): string {
  const entrada = [...(cotizacion.historialEstados ?? [])]
    .filter((item) => item.estadoNuevo === Estados.EN_SEGUIMIENTO)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (entrada?.estadoAnterior === Estados.APROBADA) return "Aprobada · entrega completa";
  if (entrada?.estadoAnterior === Estados.RECHAZADA) {
    const motivo = `${entrada.motivo ?? ""} ${cotizacion.motivoRechazo ?? ""}`.toLowerCase();
    return motivo.includes("vencimiento automático") || motivo.includes("vencimiento automatico")
      ? "Vencida · pasó a seguimiento"
      : "Rechazada · pasó a seguimiento";
  }
  return "Origen no registrado";
}

export default function SeguimientoComercial() {
  const [enSeguimiento, setEnSeguimiento] = useState<CotizacionModel[]>([]);
  const [loading, setLoading] = useState(true);
  useModuleSplashReady("seguimiento", !loading);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const revision = useRevisionTablas("cotizaciones", "historial_estado_cotizacion", "seguimientos_comerciales");
  const seguimientos = useDbTable("seguimientos_comerciales") as unknown as SeguimientoComercialModel[];
  const { loadTable } = useDbActions();
  const { data: session } = useSession();
  const { can } = usePermissions();
  const puedeGestionar = can("cotizaciones", "crear_editar");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    tipo: "LLAMADA" as TipoSeguimiento,
    descripcion: "",
    proximaGestion: "",
    resultado: "",
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [local, setLocal] = useState<SeguimientoComercialModel[]>([]);

  useEffect(() => {
    void loadTable("seguimientos_comerciales");
  }, [loadTable]);

  useEffect(() => {
    let vigente = true;
    obtenerCotizacionesEnSeguimiento().then((respuesta) => {
      if (!vigente) return;
      if (respuesta.ok && respuesta.data) setEnSeguimiento(respuesta.data);
      setErrorCarga(respuesta.ok ? null : respuesta.error ?? "No se pudo cargar Seguimiento Comercial.");
      setLoading(false);
    });
    return () => { vigente = false; };
  }, [revision]);

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
    // Deduplicar por idSeguimiento: el realtime ya inserta en el store la fila
    // creada por la API, y `local` podía volver a añadirla (doble aparición).
    const mapa = new Map<number, SeguimientoComercialModel>();
    for (const s of seguimientos) {
      if (s.idCotizacion === selectedId && !s.eliminadoAt) mapa.set(s.idSeguimiento, s);
    }
    for (const s of local) {
      if (s.idCotizacion === selectedId && !s.eliminadoAt) mapa.set(s.idSeguimiento, s);
    }
    return Array.from(mapa.values()).sort(
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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo guardar la gestión.");
    } finally {
      setSaving(false);
    }
  }, [selectedId, form, session]);

  const borrarSeguimiento = useCallback(async (id: number) => {
    const motivo = window.prompt("Motivo para eliminar esta gestión:");
    if (!motivo?.trim()) return;
    try {
      await eliminarSeguimiento(id, motivo.trim());
      setLocal((prev) => prev.filter((s) => s.idSeguimiento !== id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo eliminar la gestión.");
    }
  }, []);

  const iniciarEdicion = useCallback((s: SeguimientoComercialModel) => {
    setEditingId(s.idSeguimiento);
    setForm({
      tipo: (TIPOS_SEGUIMIENTO.some((t) => t.value === s.tipo) ? s.tipo : "OTRO") as TipoSeguimiento,
      descripcion: s.descripcion,
      proximaGestion: s.proximaGestion ? fechaParaInput(s.proximaGestion) : "",
      resultado: s.resultado ?? "",
    });
  }, []);

  const cancelarEdicion = useCallback(() => {
    setEditingId(null);
    setForm({ tipo: "LLAMADA", descripcion: "", proximaGestion: "", resultado: "" });
  }, []);

  const guardarEdicion = useCallback(async () => {
    if (!editingId || !form.descripcion.trim()) return;
    setSaving(true);
    try {
      const result = await actualizarSeguimiento(editingId, {
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        proximaGestion: form.proximaGestion ? new Date(`${form.proximaGestion}T00:00:00`) : null,
        resultado: form.resultado.trim() || null,
      });
      setLocal((prev) => prev.map((s) => s.idSeguimiento === editingId ? result.data : s));
      cancelarEdicion();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo actualizar la gestión.");
    } finally {
      setSaving(false);
    }
  }, [editingId, form, cancelarEdicion]);

  return (
    <div className="w-full p-4">
      {errorCarga && <p role="alert" className="mb-3 text-xs text-rose-700">{errorCarga}</p>}
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
        <ResponsiveTable
          loading={loading}
          data={filtered}
          rowKey={(c) => c.idCotizacion}
          onRowClick={(c) => { setSelectedId(c.idCotizacion); cancelarEdicion(); }}
          emptyText="No hay cotizaciones en seguimiento."
          minWidth="min-w-[720px]"
          columns={[
            { header: "N° Cotización", render: (c) => <span className="font-mono font-bold text-slate-700">{c.codigo}</span> },
            { header: "Cliente", render: (c) => <span className="text-slate-600">{c.cliente?.razonSocial || "N/A"}</span> },
            { header: "Valor", render: (c) => <span className="font-mono text-slate-700">{Number(c.montoTotal ?? 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</span> },
            { header: "Enviada", render: (c) => <span className="text-slate-500">{formatoFecha(c.updatedAt ?? c.createdAt)}</span> },
            { header: "Origen", render: (c) => <span className="text-slate-600">{origenSeguimiento(c)}</span> },
          ]}
          cardTitle={(c) => c.codigo}
          cardFields={[
            { label: "Cliente", value: (c) => c.cliente?.razonSocial || "N/A" },
            { label: "Valor", value: (c) => Number(c.montoTotal ?? 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) },
            { label: "Enviada", value: (c) => formatoFecha(c.updatedAt ?? c.createdAt) },
            { label: "Origen", value: origenSeguimiento },
          ]}
        />

        {/* Panel de gestión del seguimiento */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 flex flex-col gap-4">
          {!cotizacionSeleccionada ? (
            <div className="text-xs text-slate-400 text-center py-12">Selecciona una cotización para gestionar su seguimiento.</div>
          ) : (
            <>
              <div>
                <div className="text-sm font-bold text-slate-800">{cotizacionSeleccionada.codigo}</div>
                <div className="text-xs text-slate-500">{cotizacionSeleccionada.cliente?.razonSocial}</div>
                <div className="mt-1 text-[11px] font-semibold text-indigo-700">{origenSeguimiento(cotizacionSeleccionada)}</div>
              </div>

              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{editingId ? "Editar gestión" : "Nueva gestión"}</div>
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
                {puedeGestionar && !editingId && (
                <button
                  onClick={agregarSeguimiento}
                  disabled={saving || !form.descripcion.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#5680F9] text-white text-xs font-bold hover:bg-[#4069E2] disabled:opacity-50"
                >
                  <Plus size={14} /> {saving ? "Guardando..." : "Registrar gestión"}
                </button>
                )}
                {puedeGestionar && editingId && (
                  <div className="flex gap-2">
                    <button onClick={guardarEdicion} disabled={saving || !form.descripcion.trim()} className="px-3 py-2 rounded-lg bg-[#5680F9] text-white text-xs font-bold disabled:opacity-50">
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button onClick={cancelarEdicion} disabled={saving} className="px-3 py-2 rounded-lg border text-xs" aria-label="Cancelar edición"><X size={14} /></button>
                  </div>
                )}
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
                      {s.origen === "SISTEMA" && <span className="text-[10px] text-slate-400">Evento del sistema · solo lectura</span>}
                      {puedeGestionar && s.origen !== "SISTEMA" && (
                      <button
                        onClick={() => iniciarEdicion(s)}
                        className="p-2 touch-target inline-flex items-center justify-center text-slate-300 hover:text-blue-500 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      )}
                      {puedeGestionar && s.origen !== "SISTEMA" && (
                      <button
                        onClick={() => borrarSeguimiento(s.idSeguimiento)}
                        className="p-2 touch-target inline-flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                      )}
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
