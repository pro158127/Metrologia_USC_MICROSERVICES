// ============================================================
// recepciones.tsx - Componente principal de Recepción de Equipos
// ============================================================
// FASE 1-5: Implementación completa con contexto reactivo,
// mapeo a Prisma, y mutaciones con placeholder para Excel.
// ============================================================

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Package,
  FileText,
  CheckCircle,
  ArrowLeft,
  Shield,
  Calendar,
  Filter,
  Plus,
  Trash2,
  Search,
  History,
  X,
} from "lucide-react";

// Importar el contexto y los tipos
import { useDbTable, useDbActions, useDbLoading } from "./../../componets/tables_recharge";
import type {
  FilaInstrumento,
  FormularioRecepcion,
  RecepcionConInfo,
  FilterBarProps,
  RecepcionCardProps,
  DatosGeneralesSectionProps,
  TablaInstrumentosProps,
  InspeccionYFirmasSectionProps,
  FormFooterActionsProps,
  RecepcionEquipoModel,
  ClienteModel,
  CotizacionModel,
  OrdenTrabajoModel,
  TarifaModel,
} from "@/tipos/recepciones";

// ============================================================
// 2. FUNCIÓN PARA CREAR FILA VACÍA
// ============================================================

const generarIdUnico = () => Math.random().toString(36).substring(2, 9);
const crearFilaInstrumentoVacia = (): FilaInstrumento => ({
  id: generarIdUnico(),
  instrumento: "",
  marca: "",
  modelo: "",
  serie: "",
  codigoInterno: "",
  resolucion: "",
  // 🟢 Separamos IBC en Entrada (_in) y Salida (_out) con estado inicial null (gris)
  ibcE_in: null, ibcT_in: null, ibcD_in: null, ibcA_in: null,
  ibcE_out: null, ibcT_out: null, ibcD_out: null, ibcA_out: null,
  sensorInt: false,
  sensorExt: false,
  estampilla: "",
  observaciones: "",
  verificadoExcel: true,
  observacionesSecretaria: "",
  idTarifaSeleccionada: undefined,
});

// ============================================================
// 3. COMPONENTES HIJOS (adaptados a los nuevos contratos)
// ============================================================

// 3.1 Toast
const ToastNotification = ({ message }: { message: string }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

// 3.2 Header
const HeaderSection = ({
  selectedRecepcionId,
  onBack,
}: {
  selectedRecepcionId: string | null;
  onBack: () => void;
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
      <div className="flex items-center gap-3">
        {selectedRecepcionId ? (
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Package size={20} color="#5680F9" />
        )}
        <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          {selectedRecepcionId
            ? `Formato R-CM010: ${selectedRecepcionId}`
            : "Recepciones de Equipos"}
        </h1>
      </div>
    </div>
  );
};

// 3.3 FilterBar
const FilterBar = ({
  filtroCliente,
  filtroAnio,
  filtroMes,
  filtroDia,
  clientesUnicos,
  aniosDisponibles,
  onClienteChange,
  onAnioChange,
  onMesChange,
  onDiaChange,
  onAgregarRecepcion,
}: FilterBarProps) => {
  const MESES = [
    { value: "all", label: "Todos los meses" },
    { value: "01", label: "Enero" },
    { value: "02", label: "Febrero" },
    { value: "03", label: "Marzo" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Mayo" },
    { value: "06", label: "Junio" },
    { value: "07", label: "Julio" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  return (
    <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold mr-2">
          <Filter size={14} className="text-[#5680F9]" />
          <span>Filtrar por:</span>
        </div>

        <div className="relative">
          <input
            type="text"
            list="clientes-datalist"
            value={filtroCliente}
            onChange={(e) => onClienteChange(e.target.value)}
            placeholder="Buscar o selec. cliente..."
            className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none font-medium text-slate-700 w-48 placeholder:text-slate-400"
          />
          <datalist id="clientes-datalist">
            {clientesUnicos.map((cliente) => (
              <option key={cliente} value={cliente} />
            ))}
          </datalist>
          {filtroCliente && (
            <button
              onClick={() => onClienteChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-bold border-none bg-transparent cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={filtroAnio}
          onChange={(e) => onAnioChange(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none font-medium text-slate-700"
        >
          <option value="all">Todos los años</option>
          {aniosDisponibles.map((anio) => (
            <option key={anio} value={anio}>
              {anio}
            </option>
          ))}
        </select>
        <select
          value={filtroMes}
          onChange={(e) => onMesChange(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none font-medium text-slate-700"
        >
          {MESES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="h-6 w-[1px] bg-slate-200 hidden md:block" />
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
          <Calendar size={13} className="text-slate-400" />
          <input
            type="date"
            value={filtroDia}
            onChange={(e) => onDiaChange(e.target.value)}
            className="bg-transparent border-none text-xs outline-none text-slate-700 font-medium cursor-pointer"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onAgregarRecepcion}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5680F9] text-white text-xs font-bold hover:bg-[#4069E2] cursor-pointer shadow-sm border-none"
      >
        <Plus size={14} /> Agregar Recepción
      </button>
    </div>
  );
};

// 3.4 Tarjeta de Recepción (antes OrdenTrabajoCard)
const RecepcionCard = ({ recepcionInfo, onSelect }: RecepcionCardProps) => {
  return (
    <div
      onClick={() => onSelect(recepcionInfo.raw)}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#5680F9]/40 transition-all cursor-pointer min-h-32 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-extrabold text-slate-800 group-hover:text-[#5680F9]">
            {recepcionInfo.codigo}
          </span>
          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono">
            {recepcionInfo.fecha}
          </span>
        </div>
        <div className="text-xs font-medium text-slate-600">
          {recepcionInfo.clienteNombre}
        </div>
        <div className="text-[10px] text-slate-400 font-medium mt-1">
          {recepcionInfo.codigoCotizacion && (
            <span className="mr-2">Cot: {recepcionInfo.codigoCotizacion}</span>
          )}
          {recepcionInfo.codigoOT && (
            <span>OT: {recepcionInfo.codigoOT}</span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2 border-t border-slate-100">
        📦 {recepcionInfo.cantidadInstrumentos} Equipos
      </div>
    </div>
  );
};

// 3.5 DatosGeneralesSection (con búsqueda de cotización y OT)
const DatosGeneralesSection = ({
  // Valores del formulario
  solicitante,
  nombreQuienEntrega,
  cotizacionCodigo,
  ordenTrabajoCodigo,
  sitioCalibracion,
  fechaRecepcion,
  fechaSalida,
  nombreQuienRecibe,
  nombreQuienEmpaca,
  // Datos para sugerencias (desde contexto)
  clientes,
  cotizaciones,
  ordenesTrabajo,
  // Función de actualización
  isNew, // 🟢 Nueva propiedad
  bloqueado = false,
  onUpdateGeneral,
}: DatosGeneralesSectionProps & { isNew: boolean }) => {
  // En edición, si la recepción ya está atada a una OT, los campos raíz se bloquean.
  const camposRaizBloqueados = isNew || bloqueado;
  // Listas para datalist
  const clientesList = useMemo(
    () => clientes.map((c) => c.razonSocial).filter(Boolean),
    [clientes]
  );
  const cotizacionesList = useMemo(
    () => cotizaciones.map((c) => c.codigo).filter(Boolean),
    [cotizaciones]
  );
  const ordenesList = useMemo(
    () => ordenesTrabajo.map((o) => o.codigo).filter(Boolean),
    [ordenesTrabajo]
  );

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
      <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-l-[3px] border-[#5680F9] pl-2.5">
        Datos Generales del Formato (Recepción)
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Solicitante
          </label>
          <input
            list="clientes-datalist-form"
            value={solicitante}
            onChange={(e) => onUpdateGeneral("solicitante", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
            placeholder="Nombre de la empresa o cliente"
          />
          <datalist id="clientes-datalist-form">
            {clientesList.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Nombre quién entrega
          </label>
          <input
            value={nombreQuienEntrega}
            onChange={(e) => onUpdateGeneral("nombreQuienEntrega", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Cotización (código)
          </label>
          <input
            list={!camposRaizBloqueados ? "cotizaciones-datalist" : undefined}
            value={camposRaizBloqueados ? "Automático (Al guardar)" : cotizacionCodigo}
            disabled={camposRaizBloqueados}
            onChange={(e) => onUpdateGeneral("cotizacionCodigo", e.target.value)}
            className={`w-full px-3 py-1.5 rounded-xl border text-xs ${camposRaizBloqueados ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed font-medium' : 'bg-white border-slate-200'}`}
          />
          <datalist id="cotizaciones-datalist">
            {cotizacionesList.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

       <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Orden de Trabajo (código)
          </label>
          <input
            list={!camposRaizBloqueados ? "ordenes-datalist" : undefined}
            value={camposRaizBloqueados ? "Automático (Al guardar)" : ordenTrabajoCodigo}
            disabled={camposRaizBloqueados}
            onChange={(e) => onUpdateGeneral("ordenTrabajoCodigo", e.target.value)}
            className={`w-full px-3 py-1.5 rounded-xl border text-xs ${camposRaizBloqueados ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed font-medium' : 'bg-white border-slate-200'}`}
          />
          <datalist id="ordenes-datalist">
            {ordenesList.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Sitio de la calibración
          </label>
          <div className="flex gap-4 items-center h-[34px]">
            <label className="inline-flex items-center text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="sitioGlobal"
                value="Laboratorio permanente"
                checked={sitioCalibracion === "Laboratorio permanente"}
                onChange={(e) => onUpdateGeneral("sitioCalibracion", e.target.value)}
                className="mr-1.5"
              />{" "}
              Laboratorio permanente
            </label>
            <label className="inline-flex items-center text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="sitioGlobal"
                value="Instalaciones del cliente"
                checked={sitioCalibracion === "Instalaciones del cliente"}
                onChange={(e) => onUpdateGeneral("sitioCalibracion", e.target.value)}
                className="mr-1.5"
              />{" "}
              Instalaciones del cliente
            </label>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Fecha de recepción
          </label>
          <input
            type="date"
            value={fechaRecepcion}
            onChange={(e) => onUpdateGeneral("fechaRecepcion", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Fecha de salida
          </label>
          <input
            type="date"
            value={fechaSalida}
            onChange={(e) => onUpdateGeneral("fechaSalida", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Nombre quién recibe
          </label>
          <input
            value={nombreQuienRecibe}
            onChange={(e) => onUpdateGeneral("nombreQuienRecibe", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
            Nombre quién empaca
          </label>
          <input
            value={nombreQuienEmpaca}
            onChange={(e) => onUpdateGeneral("nombreQuienEmpaca", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
        </div>
      </div>
    </div>
  );
};

// 3.6 TablaInstrumentos con selector desde tarifas
const TablaInstrumentos = ({
  instrumentos,
  tarifasDisponibles,
  onFilaChange,
  onAgregarFila,
  onEliminarFila,
}: TablaInstrumentosProps) => {
  // Función para sugerir instrumentos desde tarifas
  const sugerenciasTarifas = useMemo(() => {
    return tarifasDisponibles.map((t) => ({
      label: `${t.magnitud} - ${t.tipoServicio} (${t.Instrumento})`,
      value: t.Instrumento,
      id: t.idTarifa,
      magnitud: t.magnitud,
      tipoServicio: t.tipoServicio,
      instrumento: t.Instrumento,
    }));
  }, [tarifasDisponibles]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Estructura de Equipos Metrológicos
        </span>
        <button
          type="button"
          onClick={onAgregarFila}
          className="flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 border-none cursor-pointer"
        >
          <Plus size={12} /> Añadir Instrumento
        </button>
      </div>

      <div className="overflow-auto max-h-[400px] w-full">
        <table className="w-full text-left border-collapse min-w-[1550px]">
          <thead>
            <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-white border-b border-slate-800 sticky top-0 z-10">
          
              <th className="p-3 w-48">Instrumento</th>
              <th className="p-3 w-32">Marca</th>
              <th className="p-3 w-32">Modelo</th>
              <th className="p-3 w-32">Serie</th>
              <th className="p-3 w-40">Código Interno / Inventario</th>
              <th className="p-3 w-28 text-center">Resolución</th>
              <th className="p-3 text-center w-28">
                Tipo sensor temp <br />
                <span className="text-[9px] font-normal text-slate-300">(Int | Ext)</span>
              </th>
              <th className="p-3 text-center w-40">
                Estado del IBC <br />
                <span className="text-[9px] font-normal text-slate-300">(E · T · D · A)</span>
              </th>
              <th className="p-3 w-28">Estampilla</th>
              <th className="p-3">Observaciones</th>
              <th className="p-3 text-center w-12">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {instrumentos.map((inst, i) => (
              <tr
                key={inst.id}
                className={`hover:bg-slate-50/50 transition-colors ${
                  !inst.verificadoExcel ? "bg-red-50/20" : ""
                }`}
              >
             

                <td className="p-3 font-bold text-slate-700">
                  <div className="relative">
                    <input
                      list={`instrumentos-${i}`}
                      value={inst.instrumento}
                      onChange={(e) => onFilaChange(i, "instrumento", e.target.value)}
                      placeholder="Escriba o seleccione"
                      className="w-full p-1 border border-slate-200 rounded font-medium"
                    />
                    <datalist id={`instrumentos-${i}`}>
                      {sugerenciasTarifas.map((sug) => (
                        <option
                          key={sug.id}
                          value={sug.label}
                          data-id={sug.id}
                          data-magnitud={sug.magnitud}
                          data-tipo={sug.tipoServicio}
                        />
                      ))}
                    </datalist>
                  </div>
                  {!inst.verificadoExcel && (
                    <div className="mt-1.5">
                      <textarea
                        value={inst.observacionesSecretaria}
                        onChange={(e) =>
                          onFilaChange(i, "observacionesSecretaria", e.target.value)
                        }
                        placeholder="Discrepancia física..."
                        className="w-full p-1 border border-red-200 rounded text-[10px] bg-red-50/30"
                        rows={1}
                      />
                    </div>
                  )}
                </td>

                <td className="p-2">
                  <input
                    value={inst.marca}
                    onChange={(e) => onFilaChange(i, "marca", e.target.value)}
                    className="w-full p-1 border border-slate-200 rounded"
                  />
                </td>

                <td className="p-2">
                  <input
                    value={inst.modelo}
                    onChange={(e) => onFilaChange(i, "modelo", e.target.value)}
                    className="w-full p-1 border border-slate-200 rounded"
                  />
                </td>

                <td className="p-2">
                  <input
                    value={inst.serie}
                    onChange={(e) => onFilaChange(i, "serie", e.target.value)}
                    className="w-full p-1 border border-slate-200 rounded font-mono text-[11px]"
                  />
                </td>

                <td className="p-2">
                  <input
                    value={inst.codigoInterno}
                    onChange={(e) => onFilaChange(i, "codigoInterno", e.target.value)}
                    className="w-full p-1 border border-slate-200 rounded font-mono text-[11px]"
                  />
                </td>

                <td className="p-2 bg-indigo-50/5">
                  <input
                    value={inst.resolucion}
                    onChange={(e) => onFilaChange(i, "resolucion", e.target.value)}
                    placeholder="0.01"
                    className="w-full p-1.5 border border-slate-200 rounded text-center"
                  />
                </td>

                <td className="p-3 bg-indigo-50/5 text-center whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={inst.sensorInt}
                    onChange={(e) => onFilaChange(i, "sensorInt", e.target.checked)}
                    className="mr-2"
                  />
                  <input
                    type="checkbox"
                    checked={inst.sensorExt}
                    onChange={(e) => onFilaChange(i, "sensorExt", e.target.checked)}
                  />
                </td>

              <td className="p-2 bg-indigo-50/5 text-center">
                  <div className="flex flex-col gap-1.5 items-center justify-center">
                    {/* FILA 1: ENTRADA */}
                    <div className="flex gap-1" title="Estado de Entrada">
                      {(["E", "T", "D", "A"] as const).map((k) => {
                        const key = `ibc${k}_in` as keyof FilaInstrumento;
                        const val = inst[key] as boolean | null;
                        
                        // Lógica de ciclo: Null -> True(Verde) -> False(Rojo) -> Null
                        const nextVal = val === null ? true : val === true ? false : null;
                        const colorClass = val === true ? "bg-emerald-500 border-emerald-600 text-white shadow-inner" : val === false ? "bg-red-500 border-red-600 text-white shadow-inner" : "bg-slate-100 border-slate-300 text-slate-400";
                        
                        return (
                          <button
                            key={`in-${k}`}
                            type="button"
                            onClick={() => onFilaChange(i, key, nextVal)}
                            className={`w-5 h-5 rounded-[4px] font-black border text-[9px] flex items-center justify-center transition-all cursor-pointer ${colorClass}`}
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                    {/* FILA 2: SALIDA */}
                    <div className="flex gap-1" title="Estado de Salida">
                      {(["E", "T", "D", "A"] as const).map((k) => {
                        const key = `ibc${k}_out` as keyof FilaInstrumento;
                        const val = inst[key] as boolean | null;
                        
                        const nextVal = val === null ? true : val === true ? false : null;
                        const colorClass = val === true ? "bg-emerald-500 border-emerald-600 text-white shadow-inner" : val === false ? "bg-red-500 border-red-600 text-white shadow-inner" : "bg-slate-100 border-slate-300 text-slate-400";
                        
                        return (
                          <button
                            key={`out-${k}`}
                            type="button"
                            onClick={() => onFilaChange(i, key, nextVal)}
                            className={`w-5 h-5 rounded-[4px] font-black border text-[9px] flex items-center justify-center transition-all cursor-pointer ${colorClass}`}
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </td>

                <td className="p-2">
                  <input
                    value={inst.estampilla}
                    onChange={(e) => onFilaChange(i, "estampilla", e.target.value)}
                    placeholder="USC-"
                    className="w-full p-1 border border-slate-200 rounded font-mono text-[11px]"
                  />
                </td>

                <td className="p-2">
                  <input
                    value={inst.observaciones}
                    onChange={(e) => onFilaChange(i, "observaciones", e.target.value)}
                    placeholder="Notas técnicas..."
                    className="w-full p-1 border border-slate-200 rounded"
                  />
                </td>

                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => onEliminarFila(i)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-red-500 hover:bg-red-50 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 3.7 InspeccionYFirmasSection
const InspeccionYFirmasSection = ({
  accesorios,
  pruebasCompletas,
  observacionesPruebas,
  nombreQuienCalibra,
  nombreQuienRecibeServicio,
  onUpdateGeneral,
}: InspeccionYFirmasSectionProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:col-span-1">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 border-l-[3px] border-[#5680F9] pl-2">
          Accesorios e Inspección
        </div>
        <textarea
          value={accesorios}
          onChange={(e) => onUpdateGeneral("accesorios", e.target.value)}
          placeholder="Describa los accesorios entregados..."
          className="w-full p-2 border border-slate-200 rounded-xl text-xs outline-none mb-3 font-normal"
          rows={2}
        />
        <div className="flex gap-4 items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Estado:</span>
          <label className="inline-flex items-center text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="estadoAcc"
              value="Bueno"
              checked={accesorios.includes("Bueno")}
              onChange={(e) => {
                const nuevo = e.target.value;
                onUpdateGeneral("accesorios", `Accesorios: ${nuevo} - ${accesorios.replace(/Accesorios: (Bueno|Malo) - /, "")}`);
              }}
              className="mr-1"
            />{" "}
            Bueno (✓)
          </label>
          <label className="inline-flex items-center text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="estadoAcc"
              value="Malo"
              checked={accesorios.includes("Malo")}
              onChange={(e) => {
                const nuevo = e.target.value;
                onUpdateGeneral("accesorios", `Accesorios: ${nuevo} - ${accesorios.replace(/Accesorios: (Bueno|Malo) - /, "")}`);
              }}
              className="mr-1"
            />{" "}
            Malo (✗)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 border-l-[3px] border-[#5680F9] pl-2">
          Cierre Técnico Metrólogo
        </div>
        <div className="flex flex-col gap-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase">
            ¿Pruebas a equipos de pesaje?
          </label>
          <select
            value={pruebasCompletas ? "SI" : "NO"}
            onChange={(e) => {
              const val = e.target.value;
              onUpdateGeneral("pruebasCompletas", val === "SI");
            }}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">Seleccione...</option>
            <option value="SI">SÍ</option>
            <option value="NO">NO</option>
          </select>
          {!pruebasCompletas && (
            <input
              value={observacionesPruebas}
              onChange={(e) => onUpdateGeneral("observacionesPruebas", e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
              placeholder="Si la respuesta es NO, ¿Por qué?"
            />
          )}
          <input
            value={nombreQuienCalibra}
            onChange={(e) => onUpdateGeneral("nombreQuienCalibra", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white mt-1"
            placeholder="Nombre quién calibra"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 border-l-[3px] border-[#5680F9] pl-2">
          Cierre de Servicio
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-7" />
          <input
            value={nombreQuienRecibeServicio}
            onChange={(e) => onUpdateGeneral("nombreQuienRecibeServicio", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
            placeholder="Nombre quién recibe el servicio"
          />
        </div>
      </div>
    </div>
  );
};

// 3.8 FormFooterActions
const FormFooterActions = ({
  actaGuardada,
  onGenerarActa,
  guardando = false,
}: FormFooterActionsProps) => {
  return (
    <>
      <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex-wrap gap-4">
        <div>
          <div className="text-sm font-bold text-slate-700 border-l-[3px] border-[#5680F9] pl-2">
            Repositorio de Calidad USC
          </div>
          <div className="text-xs text-slate-400 mt-1 pl-2">
            Almacenando cambios bajo auditoría del sistema.
          </div>
        </div>
        <button
          onClick={onGenerarActa}
          disabled={guardando}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm border-none ${
            guardando ? "bg-slate-400 cursor-not-allowed" : "bg-[#5680F9] hover:bg-[#4069E2] cursor-pointer"
          }`}
        >
          <FileText size={15} /> {guardando ? "Guardando..." : "Guardar Formato R-CM010"}
        </button>
      </div>

      {actaGuardada && (
        <div className="rounded-2xl p-5 bg-emerald-50 border border-emerald-100 flex items-center gap-3">
          <CheckCircle size={20} className="text-[#22C55E]" />
          <div className="text-xs text-emerald-800 font-bold">
            Estructura indexada correctamente en el sistema interno de metrología.
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================
// 4. COMPONENTE PADRE PRINCIPAL
// ============================================================
import {
  getRecepcionesEnriquecidas,
  getInitialData,
  crearRecepcion,
  actualizarRecepcion,
  eliminarInstrumentoRecepcion,
  getHistorialRecepcion,
  type HistorialCambioItem,
} from "@/app/action_module/recepciones";
export function MainRenderers() {
  // --- Estado global por tabla (solo se re-renderiza si esa tabla cambia) ---
  const recepcionesEquipo = useDbTable("recepciones_equipo");
  const cotizacionesStore = useDbTable("cotizaciones");
  const ordenesTrabajoStore = useDbTable("ordenes_trabajo");
  const clientesStore = useDbTable("clientes");
  const tarifasStore = useDbTable("tarifas");
  const { mergeTable, setTableLoading } = useDbActions();
  const loadingRecepciones = useDbLoading("recepciones_equipo");

  // --- Estado local del componente ---
  const [selectedRecepcionId, setSelectedRecepcionId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioRecepcion>({
    solicitante: "",
    nombreQuienEntrega: "",
    cotizacionCodigo: "",
    ordenTrabajoCodigo: "",
    sitioCalibracion: "",
    fechaRecepcion: new Date().toISOString().split("T")[0],
    fechaSalida: "",
    nombreQuienRecibe: "",
    nombreQuienEmpaca: "",
    accesorios: "",
    pruebasCompletas: true,
    observacionesPruebas: "",
    nombreQuienCalibra: "",
    nombreQuienRecibeServicio: "",
    instrumentos: [crearFilaInstrumentoVacia()],
  });

  // Filtros
  const [filtroCliente, setFiltroCliente] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("all");
  const [filtroAnio, setFiltroAnio] = useState<string>(new Date().getFullYear().toString());
  const [filtroDia, setFiltroDia] = useState<string>("");

  // Estado de guardado
  const [actaGuardada, setActaGuardada] = useState(false);
  const [toast, setToast] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Trazabilidad / edición
  const [recepcionActual, setRecepcionActual] = useState<RecepcionEquipoModel | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [historialItems, setHistorialItems] = useState<HistorialCambioItem[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // En edición, si la recepción ya está atada a una OT, los campos raíz se bloquean.
  const esEdicionAtada =
    selectedRecepcionId !== null &&
    selectedRecepcionId !== "NUEVA" &&
    !!recepcionActual?.idOrdenTrabajo;

  // --- Helpers ---
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

useEffect(() => {
  const fetchInitialData = async () => {
    // Si ya hay datos, evitamos recargar
    if (recepcionesEquipo.length > 0) return;
    setTableLoading("recepciones_equipo", true);
    try {
      const data = await getInitialData();
      // Actualizamos el contexto global (fusionando con el estado actual para no
      // pisar actualizaciones en tiempo real que hayan llegado durante el fetch)
      mergeTable("recepciones_equipo", data.recepciones as RecepcionEquipoModel[]);
      mergeTable("clientes", data.clientes as ClienteModel[]);
      mergeTable("cotizaciones", data.cotizaciones as CotizacionModel[]);
      mergeTable("ordenes_trabajo", data.ordenes as OrdenTrabajoModel[]);
      mergeTable("tarifas", data.tarifas as TarifaModel[]);
    } catch (error) {
      console.error(error);
    } finally {
      setTableLoading("recepciones_equipo", false);
    }
  };
  fetchInitialData();
}, []);
  // --- Derivaciones desde dbState ---
  // Lista de recepciones enriquecidas (server action)
  const [recepcionesEnriquecidas, setRecepcionesEnriquecidas] = useState<RecepcionConInfo[]>([]);

  useEffect(() => {
    let activo = true;
    getRecepcionesEnriquecidas()
      .then((data) => {
        if (activo) setRecepcionesEnriquecidas(data);
      })
      .catch((error) => {
        console.error(error);
      });
    return () => {
      activo = false;
    };
  }, []);

  // Años disponibles para el filtro (derivados de recepcionesEquipo)
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>();
    recepcionesEquipo.forEach((rec) => {
      if (rec.fechaRecepcion) {
        set.add(new Date(rec.fechaRecepcion).getFullYear().toString());
      }
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [recepcionesEquipo]);

  // Clientes únicos para filtro
  const clientesUnicos = useMemo(() => {
    const set = new Set<string>();
    recepcionesEnriquecidas.forEach((r) => {
      if (r.clienteNombre) set.add(r.clienteNombre);
    });
    return Array.from(set);
  }, [recepcionesEnriquecidas]);

  // Tarifas disponibles para autocomplete
  const tarifasDisponibles = tarifasStore || [];

  // Cotizaciones y órdenes para datalist en el formulario
  const cotizaciones = cotizacionesStore || [];
  const ordenesTrabajo = ordenesTrabajoStore || [];



  // --- Filtrado de recepciones ---
  const recepcionesFiltradas = useMemo(() => {
    return recepcionesEnriquecidas.filter((r) => {
      if (filtroCliente && !r.clienteNombre.toLowerCase().includes(filtroCliente.toLowerCase())) {
        return false;
      }
      if (filtroDia) {
        return r.fecha === filtroDia;
      }
      const [anio, mes] = r.fecha.split("-");
      const coincideAnio = filtroAnio === "all" || anio === filtroAnio;
      const coincideMes = filtroMes === "all" || mes === filtroMes;
      return coincideAnio && coincideMes;
    });
  }, [recepcionesEnriquecidas, filtroCliente, filtroDia, filtroAnio, filtroMes]);

  // --- Funciones del formulario ---
  const handleUpdateGeneral = useCallback((field: string, value: string | boolean) => {
    setFormulario((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleFilaChange = useCallback(
    (index: number, propiedad: keyof FilaInstrumento, valor: FilaInstrumento[keyof FilaInstrumento]) => {
      setFormulario((prev) => {
        const instrumentos = [...prev.instrumentos];
        instrumentos[index] = { ...instrumentos[index], [propiedad]: valor } as FilaInstrumento;
        return { ...prev, instrumentos };
      });
    },
    []
  );

  const agregarFilaInstrumento = useCallback(() => {
    setFormulario((prev) => ({
      ...prev,
      instrumentos: [...prev.instrumentos, crearFilaInstrumentoVacia()],
    }));
    showToast("➕ Nueva fila de instrumento añadida.");
  }, [showToast]);

  const eliminarFilaInstrumento = useCallback(
    async (index: number) => {
      const fila = formulario.instrumentos[index];

      // Si el instrumento ya existe en BD, se desactiva con soft delete real.
      if (fila?.idInstrumento && recepcionActual?.idRecepcion) {
        const res = await eliminarInstrumentoRecepcion(
          recepcionActual.idRecepcion,
          fila.idInstrumento
        );
        if (!res.ok) {
          showToast(res.error || "No se pudo desactivar el instrumento.");
          return;
        }
        showToast("🗑️ Instrumento desactivado (soft delete) en recepción, OT y cotización.");
      }

      setFormulario((prev) => {
        if (prev.instrumentos.length <= 1) {
          showToast("⚠️ El formato debe contener al menos un instrumento.");
          return prev;
        }
        const filtrados = prev.instrumentos.filter((_, idx) => idx !== index);
        return { ...prev, instrumentos: filtrados };
      });
    },
    [formulario.instrumentos, recepcionActual, showToast]
  );

  // --- Cargar una recepción existente para editar ---
  const cargarRecepcion = useCallback(
    (recepcion: RecepcionEquipoModel) => {
      setSelectedRecepcionId(recepcion.codigo || `REC-${recepcion.idRecepcion}`);
      // Mapear a formulario
      const cotizacionCodigo = recepcion.cotizacion?.codigo || "";
      const ordenTrabajoCodigo = recepcion.ordenTrabajo?.codigo || "";
      // Instrumentos
     const instrumentos = (recepcion.instrumentos || []).map((det) => {
        // Parseamos el JSON asumiendo que tiene la nueva estructura { entrada: {}, salida: {} }
        // Se usa 'as any' o una interfaz específica si la tienes definida para det.estadoIBC
        const estadoIBC = det.estadoIBC as {
          entrada?: Record<string, boolean | null>;
          salida?: Record<string, boolean | null>;
        } | null;
        
        return {
          id: generarIdUnico(),
          idInstrumento: det.idInstrumento,
          instrumento: det.instrumento || "",
          marca: det.marca || "",
          modelo: det.modelo || "",
          serie: det.serie || "",
          codigoInterno: det.codigoInventario || "",
          resolucion: det.resolucion || "",
          
          // 🟢 ASIGNACIÓN CORREGIDA: Mapeamos hacia _in y _out
          ibcE_in: estadoIBC?.entrada?.E ?? null,
          ibcT_in: estadoIBC?.entrada?.T ?? null,
          ibcD_in: estadoIBC?.entrada?.D ?? null,
          ibcA_in: estadoIBC?.entrada?.A ?? null,
          
          ibcE_out: estadoIBC?.salida?.E ?? null,
          ibcT_out: estadoIBC?.salida?.T ?? null,
          ibcD_out: estadoIBC?.salida?.D ?? null,
          ibcA_out: estadoIBC?.salida?.A ?? null,
          
          sensorInt: det.sensorInt ?? false,
          sensorExt: det.sensorExt ?? false,
          estampilla: det.estampilla || "",
          observaciones: det.observaciones || "",
          verificadoExcel: true,
          observacionesSecretaria: "",
          idTarifaSeleccionada: undefined,
        };
      });

      setFormulario({
        solicitante: recepcion.solicitante || "",
        nombreQuienEntrega: recepcion.nombreEntrega || "",
        cotizacionCodigo,
        ordenTrabajoCodigo,
        sitioCalibracion: recepcion.sitioCalibracion || "",
        fechaRecepcion: recepcion.fechaRecepcion
          ? new Date(recepcion.fechaRecepcion).toISOString().split("T")[0]
          : "",
        fechaSalida: recepcion.fechaSalida
          ? new Date(recepcion.fechaSalida).toISOString().split("T")[0]
          : "",
        nombreQuienRecibe: recepcion.nombreRecibe || "",
        nombreQuienEmpaca: recepcion.nombreEmpaca || "",
        accesorios: recepcion.accesorios || "",
        pruebasCompletas: recepcion.pruebasCompletas ?? true,
        observacionesPruebas: recepcion.observacionesPruebas || "",
        nombreQuienCalibra: recepcion.nombreCalibra || "",
        nombreQuienRecibeServicio: recepcion.nombreRecibeServicio || "",
        instrumentos: instrumentos.length > 0 ? instrumentos : [crearFilaInstrumentoVacia()],
      });

      setRecepcionActual(recepcion);
      setActaGuardada(false);
    },
    []
  );

  // --- Inicializar nueva recepción ---
  const inicializarNuevaRecepcion = useCallback(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setSelectedRecepcionId("NUEVA");
    setFormulario({
      solicitante: "",
      nombreQuienEntrega: "",
      cotizacionCodigo: "",
      ordenTrabajoCodigo: "",
      sitioCalibracion: "",
      fechaRecepcion: hoy,
      fechaSalida: "",
      nombreQuienRecibe: "",
      nombreQuienEmpaca: "",
      accesorios: "",
      pruebasCompletas: true,
      observacionesPruebas: "",
      nombreQuienCalibra: "",
      nombreQuienRecibeServicio: "",
      instrumentos: [crearFilaInstrumentoVacia()],
    });
    setRecepcionActual(null);
    setActaGuardada(false);
    showToast("📋 Nueva recepción creada.");
  }, [showToast]);

  // --- Volver a la lista ---
  const volverALista = useCallback(() => {
    setSelectedRecepcionId(null);
    setFormulario({
      solicitante: "",
      nombreQuienEntrega: "",
      cotizacionCodigo: "",
      ordenTrabajoCodigo: "",
      sitioCalibracion: "",
      fechaRecepcion: new Date().toISOString().split("T")[0],
      fechaSalida: "",
      nombreQuienRecibe: "",
      nombreQuienEmpaca: "",
      accesorios: "",
      pruebasCompletas: true,
      observacionesPruebas: "",
      nombreQuienCalibra: "",
      nombreQuienRecibeServicio: "",
      instrumentos: [crearFilaInstrumentoVacia()],
    });
    setRecepcionActual(null);
    setActaGuardada(false);
  }, []);

  // --- Mutación: Guardar recepción ---
const handleGenerarActa = useCallback(async () => {
    // 🟢 1. EVALUACIÓN NO BLOQUEANTE (Soft Validation)
    // Verificamos si la cabecera tiene lo mínimo
    const cabeceraLista = !!(formulario.nombreQuienEntrega && formulario.fechaRecepcion);

    // Verificamos si TODOS los instrumentos cumplen las reglas
    const instrumentosValidos = formulario.instrumentos.length > 0 && formulario.instrumentos.every((inst) => {
      const basicosLlenos = !!(inst.instrumento && inst.marca && inst.modelo && inst.serie && inst.codigoInterno && inst.resolucion);
      const entradaDiligenciada = inst.ibcE_in !== null && inst.ibcT_in !== null && inst.ibcD_in !== null && inst.ibcA_in !== null;
      
      return basicosLlenos && entradaDiligenciada;
    });

    const cumpleRequisitosCompletos = cabeceraLista && instrumentosValidos;
    const estadoCalculado = cumpleRequisitosCompletos ? "RECIBIDO" : "BORRADOR";

    // Feedback visual para el usuario
    if (cumpleRequisitosCompletos) {
      showToast("✅ Requisitos completos. La recepción se procesará como definitiva.");
    } else {
      showToast("⚠️ Faltan datos (ETDA o básicos). Se guardará el avance como BORRADOR.");
    }

    try {
      // 🟢 2. CONSTRUCCIÓN DEL PAYLOAD
      const payload = {
        // Indicador dinámico para tu Backend
        estado: estadoCalculado, 
        isNueva: selectedRecepcionId === "NUEVA",
        
        // Cabecera
        solicitante: formulario.solicitante,
        nombreEntrega: formulario.nombreQuienEntrega || undefined,
        cotizacionCodigo: formulario.cotizacionCodigo || undefined,
        ordenTrabajoCodigo: formulario.ordenTrabajoCodigo || undefined,
        sitioCalibracion: formulario.sitioCalibracion,
        fechaRecepcion: formulario.fechaRecepcion,
        fechaSalida: formulario.fechaSalida || undefined,
        nombreRecibe: formulario.nombreQuienRecibe || undefined,
        nombreEmpaca: formulario.nombreQuienEmpaca || undefined,
        accesorios: formulario.accesorios || undefined,
        pruebasCompletas: formulario.pruebasCompletas,
        observacionesPruebas: formulario.observacionesPruebas || undefined,
        nombreCalibra: formulario.nombreQuienCalibra || undefined,
        nombreRecibeServicio: formulario.nombreQuienRecibeServicio || undefined,
        
        // Instrumentos con mapeo exacto de Entrada y Salida
        instrumentos: formulario.instrumentos.map((inst) => ({
          idLocal: inst.id,
          instrumento: inst.instrumento,
          marca: inst.marca || undefined,
          modelo: inst.modelo || undefined,
          serie: inst.serie || undefined,
          codigoInventario: inst.codigoInterno || undefined,
          resolucion: inst.resolucion || undefined,
          sensorInt: inst.sensorInt ?? false,
          sensorExt: inst.sensorExt ?? false,
          estampilla: inst.estampilla || undefined,
          observaciones: inst.observaciones || undefined,
          
          // Estructura JSON para la columna ESTADO_IBC en tu BD
          estadoIBC: {
            entrada: {
              E: inst.ibcE_in,
              T: inst.ibcT_in,
              D: inst.ibcD_in,
              A: inst.ibcA_in
            },
            salida: {
              E: inst.ibcE_out,
              T: inst.ibcT_out,
              D: inst.ibcD_out,
              A: inst.ibcA_out
            }
          }
        })),
      };

      console.log("📤 Payload a enviar al backend:", payload);

      // 🟢 3. LLAMADA AL SERVER ACTION (crear o actualizar según el modo)
      setGuardando(true);
      const esNueva = selectedRecepcionId === "NUEVA" || !recepcionActual;
      const response = esNueva
        ? await crearRecepcion(payload)
        : await actualizarRecepcion(recepcionActual.idRecepcion, payload);

      if (!response.ok) {
        throw new Error(response.error || "Fallo al persistir en el servidor");
      }

      setActaGuardada(true);
      showToast(response.message || "✅ Recepción guardada correctamente.");

      // Refrescar la tabla global de recepciones (fusionando, sin pisar tiempo real)
      setTableLoading("recepciones_equipo", true);
      try {
        const data = await getInitialData();
        mergeTable("recepciones_equipo", data.recepciones as RecepcionEquipoModel[]);
        mergeTable("clientes", data.clientes as ClienteModel[]);
        mergeTable("cotizaciones", data.cotizaciones as CotizacionModel[]);
        mergeTable("ordenes_trabajo", data.ordenes as OrdenTrabajoModel[]);
        mergeTable("tarifas", data.tarifas as TarifaModel[]);
      } finally {
        setTableLoading("recepciones_equipo", false);
      }

      // Si era nueva, lo sacamos a la lista después de guardar
      if (esNueva) {
        setTimeout(() => {
          volverALista();
        }, 1500);
      }
    } catch (error) {
      const mensaje = (error as Error)?.message;
      console.error("Error al guardar recepción:", error);
      showToast(mensaje ? `❌ ${mensaje}` : "❌ Error al persistir los datos en el servidor.");
    } finally {
      setGuardando(false);
    }
  }, [formulario, selectedRecepcionId, recepcionActual, showToast, volverALista, mergeTable, setTableLoading]);

  // --- Trazabilidad: cargar historial de cambios de la cotización ---
  const abrirHistorial = useCallback(async () => {
    if (!recepcionActual?.idRecepcion) {
      showToast("⚠️ Guarda la recepción para consultar su trazabilidad.");
      return;
    }
    setHistorialAbierto(true);
    setCargandoHistorial(true);
    try {
      setHistorialItems(await getHistorialRecepcion(recepcionActual.idRecepcion));
    } finally {
      setCargandoHistorial(false);
    }
  }, [recepcionActual, showToast]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="module-page" style={{ position: "relative" }}>
      <ToastNotification message={toast} />

      <HeaderSection
        selectedRecepcionId={selectedRecepcionId}
        onBack={volverALista}
      />

      {selectedRecepcionId === null ? (
        // --- VISTA DE LISTA ---
        <div className="flex flex-col gap-5">
          <FilterBar
            filtroCliente={filtroCliente}
            filtroAnio={filtroAnio}
            filtroMes={filtroMes}
            filtroDia={filtroDia}
            clientesUnicos={clientesUnicos}
            aniosDisponibles={aniosDisponibles}
            onClienteChange={setFiltroCliente}
            onAnioChange={(anio) => {
              setFiltroAnio(anio);
              setFiltroDia("");
            }}
            onMesChange={(mes) => {
              setFiltroMes(mes);
              setFiltroDia("");
            }}
            onDiaChange={setFiltroDia}
            onAgregarRecepcion={inicializarNuevaRecepcion}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loadingRecepciones ? (
              [1, 2, 3].map((n) => (
                <div key={n} className="h-40 rounded-2xl bg-slate-200 animate-pulse" />
              ))
            ) : recepcionesFiltradas.length > 0 ? (
              recepcionesFiltradas.map((r) => (
                <RecepcionCard
                  key={r.idRecepcion}
                  recepcionInfo={r}
                  onSelect={cargarRecepcion}
                />
              ))
            ) : (
              <div className="text-xs font-medium text-slate-400 col-span-1 md:col-span-3 p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No se encontraron recepciones que coincidan con los filtros aplicados.
              </div>
            )}
          </div>
        </div>
      ) : (
        // --- VISTA DE FORMULARIO ---
        <div className="flex flex-col gap-5">
          {recepcionActual && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white shadow-sm px-4 py-2.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {esEdicionAtada
                  ? "Edición atada a OT — campos raíz bloqueados"
                  : `Editando recepción ${recepcionActual.codigo}`}
              </span>
              <button
                onClick={abrirHistorial}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer border-none"
              >
                <History size={14} /> Ver trazabilidad
              </button>
            </div>
          )}

          <DatosGeneralesSection
             isNew={selectedRecepcionId === "NUEVA"}
            bloqueado={esEdicionAtada}
            solicitante={formulario.solicitante}
            nombreQuienEntrega={formulario.nombreQuienEntrega}
            cotizacionCodigo={formulario.cotizacionCodigo}
            ordenTrabajoCodigo={formulario.ordenTrabajoCodigo}
            sitioCalibracion={formulario.sitioCalibracion}
            fechaRecepcion={formulario.fechaRecepcion}
            fechaSalida={formulario.fechaSalida}
            nombreQuienRecibe={formulario.nombreQuienRecibe}
            nombreQuienEmpaca={formulario.nombreQuienEmpaca}
            clientes={clientesStore || []}
            cotizaciones={cotizaciones}
            ordenesTrabajo={ordenesTrabajo}
            onUpdateGeneral={handleUpdateGeneral}
          />

          <TablaInstrumentos
            instrumentos={formulario.instrumentos}
            tarifasDisponibles={tarifasDisponibles}
            onFilaChange={handleFilaChange}
            onAgregarFila={agregarFilaInstrumento}
            onEliminarFila={eliminarFilaInstrumento}
          />

          <InspeccionYFirmasSection
            accesorios={formulario.accesorios}
            pruebasCompletas={formulario.pruebasCompletas}
            observacionesPruebas={formulario.observacionesPruebas}
            nombreQuienCalibra={formulario.nombreQuienCalibra}
            nombreQuienRecibeServicio={formulario.nombreQuienRecibeServicio}
            onUpdateGeneral={handleUpdateGeneral}
          />

          <FormFooterActions
            actaGuardada={actaGuardada}
            onGenerarActa={handleGenerarActa}
            guardando={guardando}
          />
        </div>
      )}

      {historialAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-100 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <History size={16} /> Trazabilidad de cambios
              </div>
              <button
                onClick={() => setHistorialAbierto(false)}
                className="text-slate-400 hover:text-slate-700 border-none bg-transparent cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {cargandoHistorial ? (
                <div className="text-xs text-slate-400">Cargando historial...</div>
              ) : historialItems.length === 0 ? (
                <div className="text-xs text-slate-400">Sin cambios registrados.</div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {historialItems.map((h) => (
                    <li key={h.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#5680F9]">{h.numeroVersion}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(h.fechaCambio).toLocaleString("es-CO")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">{h.descripcion}</p>
                      {h.observaciones && (
                        <p className="text-[11px] text-slate-500 mt-1">Obs: {h.observaciones}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">Aprobó: {h.aprobo}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainRenderers;