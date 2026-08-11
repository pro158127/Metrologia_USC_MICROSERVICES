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
} from "lucide-react";

// Importar el contexto y los tipos
import { useDbTable, useDbActions } from "./../../componets/tables_recharge";
import type {
  RecepcionEquipoModel,
  ClienteModel,
  CotizacionModel,
  OrdenTrabajoModel,
  TarifaModel,
} from "./../../componets/tables_recharge";

// ============================================================
// 1. TIPOS LOCALES (estado del formulario)
// ============================================================

interface FilaInstrumento {
  // Identificador temporal (solo para UI)
  id: string;
  // Campos que se guardan en RecepcionEquipoDetalle
  instrumento: string;
  marca: string;
  modelo: string;
  serie: string;
  codigoInterno: string; // codigoInventario
  resolucion: string;
  // Estado IBC como objeto
  ibcE: boolean;
  ibcT: boolean;
  ibcD: boolean;
  ibcA: boolean;
  sensorInt: boolean;
  sensorExt: boolean;
  estampilla: string;
  observaciones: string;
  // Para control de UI
  verificadoExcel: boolean;
  observacionesSecretaria: string;
  // Referencia a tarifa seleccionada (opcional)
  idTarifaSeleccionada?: number;
}

// Estado completo del formulario de recepción
interface FormularioRecepcion {
  // Cabecera (RecepcionEquipo)
  solicitante: string;
  nombreQuienEntrega: string;
  cotizacionCodigo: string; // para buscar ID
  ordenTrabajoCodigo: string; // para buscar ID
  sitioCalibracion: "Laboratorio permanente" | "Instalaciones del cliente" | "";
  fechaRecepcion: string;
  fechaSalida: string;
  nombreQuienRecibe: string;
  nombreQuienEmpaca: string;
  accesorios: string;
  pruebasCompletas: boolean; // true = SI, false = NO
  observacionesPruebas: string; // el "por qué"
  nombreQuienCalibra: string;
  nombreQuienRecibeServicio: string;
  // Detalles
  instrumentos: FilaInstrumento[];
}

// Para la vista de lista (recepciones enriquecidas)
interface RecepcionConInfo {
  idRecepcion: number;
  codigo: string;
  clienteNombre: string;
  fecha: string;
  cantidadInstrumentos: number;
  // Códigos combinados
  codigoCotizacion?: string;
  codigoOT?: string;
  // Objeto original
  raw: RecepcionEquipoModel;
}

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
  ibcE: false,
  ibcT: false,
  ibcD: false,
  ibcA: false,
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
  onClienteChange,
  onAnioChange,
  onMesChange,
  onDiaChange,
  onAgregarRecepcion,
}: {
  filtroCliente: string;
  filtroAnio: string;
  filtroMes: string;
  filtroDia: string;
  clientesUnicos: string[];
  onClienteChange: (val: string) => void;
  onAnioChange: (val: string) => void;
  onMesChange: (val: string) => void;
  onDiaChange: (val: string) => void;
  onAgregarRecepcion: () => void;
}) => {
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
          <option value="2025">2025</option>
          <option value="2026">2026</option>
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
const RecepcionCard = ({
  recepcionInfo,
  onSelect,
}: {
  recepcionInfo: RecepcionConInfo;
  onSelect: (recepcion: RecepcionEquipoModel) => void;
}) => {
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
  onUpdateGeneral,
}: {
  solicitante: string;
  nombreQuienEntrega: string;
  cotizacionCodigo: string;
  ordenTrabajoCodigo: string;
  sitioCalibracion: "Laboratorio permanente" | "Instalaciones del cliente" | "";
  fechaRecepcion: string;
  fechaSalida: string;
  nombreQuienRecibe: string;
  nombreQuienEmpaca: string;
  clientes: ClienteModel[];
  cotizaciones: CotizacionModel[];
  ordenesTrabajo: OrdenTrabajoModel[];
  onUpdateGeneral: (field: string, value: string) => void;
}) => {
  // Listas para datalist
  const clientesList = clientes.map((c) => c.razonSocial).filter(Boolean);
  const cotizacionesList = cotizaciones.map((c) => c.codigo).filter(Boolean);
  const ordenesList = ordenesTrabajo.map((o) => o.codigo).filter(Boolean);

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
            list="cotizaciones-datalist"
            value={cotizacionCodigo}
            onChange={(e) => onUpdateGeneral("cotizacionCodigo", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
            placeholder="Ej: COT-045"
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
            list="ordenes-datalist"
            value={ordenTrabajoCodigo}
            onChange={(e) => onUpdateGeneral("ordenTrabajoCodigo", e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
            placeholder="Ej: OT-2026-090"
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
}: {
  instrumentos: FilaInstrumento[];
  tarifasDisponibles: TarifaModel[];
  onFilaChange: (index: number, propiedad: keyof FilaInstrumento, valor: any) => void;
  onAgregarFila: () => void;
  onEliminarFila: (index: number) => void;
}) => {
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
              <th className="p-3 text-center w-10 bg-blue-600">V.</th>
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
                <td className="p-3 text-center bg-blue-50/10">
                  <input
                    type="checkbox"
                    checked={inst.verificadoExcel}
                    onChange={(e) => {
                      onFilaChange(i, "verificadoExcel", e.target.checked);
                      if (e.target.checked)
                        onFilaChange(i, "observacionesSecretaria", "");
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                </td>

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
                  <div className="flex gap-1 justify-center">
                    {(["ibcE", "ibcT", "ibcD", "ibcA"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onFilaChange(i, k, !inst[k])}
                        className={`w-6 h-6 rounded font-black border text-[9px] flex items-center justify-center transition-all cursor-pointer ${
                          inst[k]
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-slate-300 text-slate-300"
                        }`}
                      >
                        {k.replace("ibc", "")}
                      </button>
                    ))}
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
}: {
  accesorios: string;
  pruebasCompletas: boolean;
  observacionesPruebas: string;
  nombreQuienCalibra: string;
  nombreQuienRecibeServicio: string;
  onUpdateGeneral: (field: string, value: string | boolean) => void;
}) => {
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
}: {
  actaGuardada: boolean;
  onGenerarActa: () => void;
}) => {
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
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#5680F9] text-white hover:bg-[#4069E2] cursor-pointer shadow-sm border-none"
        >
          <FileText size={15} /> Guardar Formato R-CM010
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
import { getRecepcionesEnriquecidas,getInitialData } from "@/app/action_module/recepciones";
export function MainRenderers() {
  // --- Estado global por tabla (solo se re-renderiza si esa tabla cambia) ---
  const recepcionesEquipo = useDbTable("recepciones_equipo");
  const cotizacionesStore = useDbTable("cotizaciones");
  const ordenesTrabajoStore = useDbTable("ordenes_trabajo");
  const clientesStore = useDbTable("clientes");
  const tarifasStore = useDbTable("tarifas");
  const { setDbState } = useDbActions();

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

  // --- Helpers ---
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

useEffect(() => {
  const fetchInitialData = async () => {
    // Si ya hay datos, evitamos recargar
    if (recepcionesEquipo.length > 0) return;
    try {
      const data = await getInitialData();
      // Actualizamos el contexto global
      setDbState((prev) => ({
        ...prev,
        recepciones_equipo: data.recepciones as RecepcionEquipoModel[],
        clientes: data.clientes as ClienteModel[],
        cotizaciones: data.cotizaciones as CotizacionModel[],
        ordenes_trabajo: data.ordenes as OrdenTrabajoModel[],
        tarifas: data.tarifas as TarifaModel[],
      }));
    } catch (error) {
      console.error(error);
    }
  };
  fetchInitialData();
}, []);
  // --- Derivaciones desde dbState ---
  // Lista de recepciones enriquecidas
  const recepcionesEnriquecidas = useMemo<RecepcionConInfo[]>(() => {
    // Usamos las recepciones del contexto
    const recepciones = recepcionesEquipo || [];
    const cotizacionesMap = new Map(
      cotizacionesStore?.map((c) => [c.idCotizacion, c]) || []
    );
    const ordenesMap = new Map(
      ordenesTrabajoStore?.map((o) => [o.idOrdenTrabajo, o]) || []
    );
    const clientesMap = new Map(
      clientesStore?.map((c) => [c.idCliente, c]) || []
    );


    return recepciones.map((rec) => {
      // Obtener cliente desde cotización u orden de trabajo
      let clienteNombre = "Cliente no especificado";
      if (rec.cotizacion?.cliente) {
        clienteNombre = rec.cotizacion.cliente.razonSocial || "Sin razón social";
      } else if (rec.ordenTrabajo?.cliente) {
        clienteNombre = rec.ordenTrabajo.cliente.razonSocial || "Sin razón social";
      } else if (rec.idCotizacion) {
        const cot = cotizacionesMap.get(rec.idCotizacion);
        if (cot?.cliente) clienteNombre = cot.cliente.razonSocial || "Sin razón social";
      } else if (rec.idOrdenTrabajo) {
        const ot = ordenesMap.get(rec.idOrdenTrabajo);
        if (ot?.cliente) clienteNombre = ot.cliente.razonSocial || "Sin razón social";
      }

      const codigoCotizacion = rec.cotizacion?.codigo || "";
      const codigoOT = rec.ordenTrabajo?.codigo || "";

      return {
        idRecepcion: rec.idRecepcion,
        codigo: rec.codigo || `REC-${rec.idRecepcion}`,
        clienteNombre,
        fecha: rec.fechaRecepcion ? new Date(rec.fechaRecepcion).toISOString().split("T")[0] : "",
        cantidadInstrumentos: rec.instrumentos?.length || 0,
        codigoCotizacion,
        codigoOT,
        raw: rec,
      };
    });
  }, [recepcionesEquipo, cotizacionesStore, ordenesTrabajoStore, clientesStore]);

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
  const actualizarFormulario = useCallback((campo: keyof FormularioRecepcion, valor: any) => {
    setFormulario((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }, []);

  const handleUpdateGeneral = useCallback((field: string, value: string | boolean) => {
    setFormulario((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleFilaChange = useCallback(
    (index: number, propiedad: keyof FilaInstrumento, valor: any) => {
      setFormulario((prev) => {
        const instrumentos = [...prev.instrumentos];
        instrumentos[index] = { ...instrumentos[index], [propiedad]: valor };
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
    (index: number) => {
      setFormulario((prev) => {
        if (prev.instrumentos.length <= 1) {
          showToast("⚠️ El formato debe contener al menos un instrumento.");
          return prev;
        }
        const filtrados = prev.instrumentos.filter((_, idx) => idx !== index);
        return { ...prev, instrumentos: filtrados };
      });
    },
    [showToast]
  );

  // --- Cargar una recepción existente para editar ---
  const cargarRecepcion = useCallback(
    (recepcion: RecepcionEquipoModel) => {
      setSelectedRecepcionId(recepcion.codigo || `REC-${recepcion.idRecepcion}`);
      // Mapear a formulario
      const cotizacionCodigo = recepcion.cotizacion?.codigo || "";
      const ordenTrabajoCodigo = recepcion.ordenTrabajo?.codigo || "";
      // Instrumentos
      const instrumentos = (recepcion.instrumentos || []).map((det) => ({
        id: generarIdUnico(),
        instrumento: det.instrumento || "",
        marca: det.marca || "",
        modelo: det.modelo || "",
        serie: det.serie || "",
        codigoInterno: det.codigoInventario || "",
        resolucion: det.resolucion || "",
        ibcE: (det.estadoIBC as any)?.E || false,
        ibcT: (det.estadoIBC as any)?.T || false,
        ibcD: (det.estadoIBC as any)?.D || false,
        ibcA: (det.estadoIBC as any)?.A || false,
        sensorInt: false, // No existe en schema, se deja false por defecto
        sensorExt: false,
        estampilla: det.estampilla || "",
        observaciones: det.observaciones || "",
        verificadoExcel: true,
        observacionesSecretaria: "",
        idTarifaSeleccionada: undefined,
      }));

      setFormulario({
        solicitante: recepcion.solicitante || "",
        nombreQuienEntrega: recepcion.nombreEntrega || "",
        cotizacionCodigo,
        ordenTrabajoCodigo,
        sitioCalibracion: (recepcion.sitioCalibracion as any) || "",
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
    setActaGuardada(false);
  }, []);

  // --- Mutación: Guardar recepción ---
  const handleGenerarActa = useCallback(async () => {
    try {
      // Construir payload
      const payload = {
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
        // Instrumentos
        instrumentos: formulario.instrumentos.map((inst) => ({
          instrumento: inst.instrumento,
          marca: inst.marca || undefined,
          modelo: inst.modelo || undefined,
          serie: inst.serie || undefined,
          codigoInventario: inst.codigoInterno || undefined,
          resolucion: inst.resolucion || undefined,
          observaciones: inst.observaciones || undefined,
          estampilla: inst.estampilla || undefined,
          sensorInt: inst.sensorInt,
          sensorExt: inst.sensorExt,
          ibcE: inst.ibcE,
          ibcT: inst.ibcT,
          ibcD: inst.ibcD,
          ibcA: inst.ibcA,
        })),
      };

      // Llamada a la API (simulada)
      // Reemplazar con fetch real cuando el backend esté listo
      console.log("📤 Enviando mutación:", payload);

      // Simular respuesta exitosa
      const response = {
        recepcion: {
          idRecepcion: 999,
          codigo: `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`,
          // ... resto de campos
        },
        documentoGenerado: null,
        excelGenerado: true,
      };

      setActaGuardada(true);
      showToast(`✅ Recepción guardada correctamente: ${response.recepcion.codigo}`);

      // Opcional: si es nueva, actualizar la lista (el contexto se actualizará vía socket)
      // Forzar recarga de la lista
      if (selectedRecepcionId === "NUEVA") {
        // En producción, el socket actualizará dbState automáticamente.
        // Por ahora, solo volvemos a la lista después de unos segundos.
        setTimeout(() => {
          volverALista();
        }, 2000);
      }
    } catch (error) {
      console.error("Error al guardar recepción:", error);
      showToast("❌ Error al guardar la recepción.");
    }
  }, [formulario, selectedRecepcionId, showToast, volverALista]);

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
            {recepcionesFiltradas.length > 0 ? (
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
          <DatosGeneralesSection
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
          />
        </div>
      )}
    </div>
  );
}

export default MainRenderers;