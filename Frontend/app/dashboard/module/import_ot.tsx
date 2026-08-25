  "use client";

  // 1. Imports
  import React, { useState, useEffect } from "react";
  import { Link, FileText, Unlink, Layers, AlertTriangle, Search, Filter } from "lucide-react";
  import { useDbStore } from "../../stores/dbstore"; 
  import { procesarImportacionOTAction, consultarEstadoJobAction } from "@/app/action_module/ordenes";
  import { useSession } from "next-auth/react";

  // Interfaces y Tipos
  interface GeneratedOT {
    id: number;
    number: string;
    client: string;
    date: string;
    equipmentCount: number;
    status: "Pendiente" | "En proceso" | "Completada" | string;
    cotizacionReferencia?: string; 
  }

  interface RecepcionPorCotizacion {
    cotizacion: string;
    cliente: string;
    fechaRecepcion: string;
    equiposContados: number;
  }

  // 2. Componentes Hijos

  const ToastNotification: React.FC<{ message: string }> = ({ message }) => {
    if (!message) return null;
    return (
      <div className="fixed top-4 right-4 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl z-50 text-xs font-bold border border-slate-800 animate-fadeIn">
        {message}
      </div>
    );
  };

  const FlowSelector: React.FC<{ tipoFlujo: "estandar" | "inverso", onSelectFlow: (f: "estandar" | "inverso") => void }> = ({ tipoFlujo, onSelectFlow }) => (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-xl">
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Layers size={12} /> Configuración del Flujo Operativo
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onSelectFlow("estandar")} className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${tipoFlujo === "estandar" ? "bg-white border-blue-500 text-blue-600 shadow-sm" : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"}`}>
          🔄 Flujo Estándar (Extraer Excel)
        </button>
        <button type="button" onClick={() => onSelectFlow("inverso")} className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${tipoFlujo === "inverso" ? "bg-white border-blue-500 text-blue-600 shadow-sm" : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"}`}>
          ↪️ Flujo Inverso (Vincular Manual)
        </button>
      </div>
    </div>
  );

  const FileUploadZone: React.FC<any> = ({ tipoFlujo, file, showForm, onFileChange, onRemoveFile, onExtract, onStartManual }) => {
    if (!file) {
      return (
        <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full max-w-md border-2 border-dashed border-slate-200 rounded-2xl p-8 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition">
          <span className="text-4xl mb-2">📁</span>
          <span className="text-sm font-bold text-slate-700">Adjunta OT Excel</span>
          <input id="file-upload" type="file" accept=".xlsx" onChange={onFileChange} className="hidden" />
        </label>
      );
    }
    
    if (file && !showForm) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-200 p-3.5">
            <span className="text-slate-800 text-xs font-semibold">📄 {file.name}</span>
            <button onClick={onRemoveFile} className="text-xs text-blue-600 hover:underline bg-transparent border-none cursor-pointer font-bold">Cambiar archivo</button>
          </div>
          <button 
            onClick={tipoFlujo === "estandar" ? onExtract : onStartManual} 
            className="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 border-none cursor-pointer shadow-sm transition"
          >
            {tipoFlujo === "estandar" ? "Siguiente Paso (Auto-detectar)" : "Siguiente Paso (Vincular Manual)"}
          </button>
        </div>
      );
    }
    return null;
  };

  const OTFormSection: React.FC<any> = ({ tipoFlujo, cotizacionExtraida, otNumber, date, client, cotizacionSeleccionada, recepciones, isProcessing, onCotizacionChange, onGenerateOT }) => (
    <div className="mt-4 space-y-5 border-t border-slate-100 pt-4 animate-fadeIn">
      {tipoFlujo === "estandar" && cotizacionExtraida && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div><span className="font-bold">Información de control:</span> Se detectó la cotización <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded font-bold text-amber-900">{cotizacionExtraida}</span>. Verifique si es correcta o cámbiela.</div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">N° OT</label>
          <input disabled className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium bg-slate-100" value={otNumber} placeholder="Pendiente..." />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha</label>
          <input disabled type="date" className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium bg-slate-100" value={date} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente / Solicitante</label>
          <input disabled className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium bg-slate-100" value={client} placeholder="Autodetectado..." />
        </div>
      </div>
      
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          {tipoFlujo === "estandar" ? "Asociar / Reemplazar por Cotización Vigente del Sistema" : "Seleccionar Cotización Origen Obligatoria"}
        </label>
        <select value={cotizacionSeleccionada} onChange={(e) => onCotizacionChange(e.target.value)} disabled={isProcessing} className="w-full max-w-xl px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-blue-500 font-medium text-slate-700 font-mono">
          <option value="">{tipoFlujo === "estandar" ? "-- Creación aislada (Flujo anormal) --" : "-- Seleccionar cotización vigente --"}</option>
          {recepciones.map((rec: any) => (
            <option key={rec.cotizacion} value={rec.cotizacion}>{rec.cotizacion} — {rec.cliente} ({rec.equiposContados} Equipos registrados)</option>
          ))}
        </select>
      </div>
      <button onClick={onGenerateOT} disabled={isProcessing || (tipoFlujo === "inverso" && !cotizacionSeleccionada)} className="w-full bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-bold text-xs shadow-sm border-none cursor-pointer transition disabled:bg-slate-400 disabled:cursor-not-allowed">
        {isProcessing ? "Procesando importación y validando reglas..." : (cotizacionSeleccionada ? `Procesar OT Vinculada a ${cotizacionSeleccionada}` : "Procesar Orden de Trabajo Autónoma")}
      </button>
    </div>
  );

  // 🔥 COMPONENTE REFABRICADO CON FILTROS Y SCROLL RESPONSIVO
  const OTTableSection: React.FC<{ generatedOTs: GeneratedOT[] }> = ({ generatedOTs }) => {
    const [filterOT, setFilterOT] = useState("");
    const [filterClient, setFilterClient] = useState("");
    const [filterDate, setFilterDate] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    const filteredOTs = generatedOTs.filter(ot => {
      const matchOT = ot.number.toLowerCase().includes(filterOT.toLowerCase());
      const matchClient = ot.client.toLowerCase().includes(filterClient.toLowerCase());
      const matchDate = filterDate ? ot.date === filterDate : true;
      const matchStatus = filterStatus ? ot.status.toLowerCase() === filterStatus.toLowerCase() : true;
      return matchOT && matchClient && matchDate && matchStatus;
    });

    return (
      <section>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-4 gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            Órdenes de Trabajo Generadas <span className="text-xs font-normal text-slate-400">({filteredOTs.length} en total)</span>
          </h2>
          
          {/* Panel de Filtros */}
          <div className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-full lg:w-auto">
            <Filter size={14} className="text-slate-400 ml-1 hidden sm:block" />
            <input 
              type="text" 
              placeholder="Filtrar N° OT..." 
              value={filterOT} 
              onChange={(e) => setFilterOT(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 w-full sm:w-32"
            />
            <input 
              type="text" 
              placeholder="Filtrar Cliente..." 
              value={filterClient} 
              onChange={(e) => setFilterClient(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 w-full sm:w-40"
            />
            <input 
              type="date" 
              value={filterDate} 
              onChange={(e) => setFilterDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 w-full sm:w-32 text-slate-600"
            />
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 w-full sm:w-32 bg-white text-slate-600"
            >
              <option value="">Todos los Estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="creada">Creada</option>
              <option value="en proceso">En proceso</option>
              <option value="completada">Completada</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
          {/* Contenedor limitador con Scroll Vertical (max-h-96 = 384px) */}
          <div className="overflow-x-auto overflow-y-auto max-h-96 custom-scrollbar">
            <table className="w-full text-xs text-left border-collapse min-w-[800px]">
              {/* Cabecera Pegajosa (Sticky) */}
              <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <th className="px-5 py-3">N° OT</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3 text-center">Equipos</th>
                  <th className="px-5 py-3">Cotización Referencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOTs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400 font-medium">
                      No se encontraron órdenes de trabajo con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredOTs.map((ot) => (
                    <tr key={ot.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3 font-mono font-bold text-blue-600">{ot.number}</td>
                      <td className="px-5 py-3 font-semibold text-slate-700 truncate max-w-[200px]">{ot.client}</td>
                      <td className="px-5 py-3 font-medium text-slate-400 font-mono">{ot.date}</td>
                      <td className="px-5 py-3 text-center"><span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">{ot.equipmentCount}</span></td>
                      <td className="px-5 py-3">
                        {ot.cotizacionReferencia ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100 font-bold text-[10px]"><Link size={10} /> {ot.cotizacionReferencia}</div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 border border-slate-100 font-medium text-[10px]"><Unlink size={10} /> Sin Vincular</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">{ot.status}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button className="bg-slate-100 text-slate-700 font-bold px-3 py-1 rounded-xl text-[11px] hover:bg-slate-200 border-none cursor-pointer transition">
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  };

  // 3. Componente Padre Principal
  export const MainRenderer2: React.FC = () => {
    const { data: session } = useSession();
    const [isMounted, setIsMounted] = useState(false);

    const { cotizaciones, ordenes_trabajo, loadTable } = useDbStore();

    const [file, setFile] = useState<File | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [otNumber, setOtNumber] = useState("");
    const [date, setDate] = useState("");
    const [client, setClient] = useState("");
    const [toast, setToast] = useState("");
    const [tipoFlujo, setTipoFlujo] = useState<"estandar" | "inverso">("estandar");
    const [cotizacionExtraida, setCotizacionExtraida] = useState(""); 
    const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
      setIsMounted(true);
      loadTable('ordenes_trabajo');
      loadTable('cotizaciones');
    }, [loadTable]);

    useEffect(() => {
      if (toast) {
        const timer = setTimeout(() => setToast(""), 5000);
        return () => clearTimeout(timer);
      }
    }, [toast]);

    if (!isMounted) {
      return <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><span className="text-slate-400 font-bold text-sm">Cargando módulo...</span></div>;
    }

    const cotizacionesVinculables = (cotizaciones || [])
      .filter((c: any) => c.estado === 'APROBADA' || c.estado === 'ENVIADA')
      .map((c: any) => ({
        cotizacion: c.codigo,
        cliente: c.cliente?.razonSocial || "Cliente no registrado",
        fechaRecepcion: c.createdAt ? String(c.createdAt).substring(0, 10) : "-",
        equiposContados: c.detalles?.length || 0
      }));

    const generatedOTs = (ordenes_trabajo || []).map((ot: any) => ({
      id: ot.idOrdenTrabajo,
      number: ot.codigo,
      client: ot.cliente?.razonSocial || "Sin cliente",
      date: ot.createdAt ? String(ot.createdAt).substring(0, 10) : "-",
      equipmentCount: ot.instrumentos?.length || 0,
      status: ot.estado || "Pendiente",
      cotizacionReferencia: ot.cotizacion?.codigo || undefined
    }));

    const handleCotizacionChange = (cotiz: string) => {
      setCotizacionSeleccionada(cotiz);
      const datosCotiz = cotizacionesVinculables.find((r: any) => r.cotizacion === cotiz);
      
      if (datosCotiz) {
        setClient(datosCotiz.cliente);
        setOtNumber(`Asignado vía ${cotiz}`);
        setDate(new Date().toISOString().split("T")[0]);
      } else {
        setClient("");
        setOtNumber(tipoFlujo === "inverso" ? "Esperando selección..." : "Asignación Automática");
        setDate(tipoFlujo === "inverso" ? "" : new Date().toISOString().split("T")[0]);
      }
    };

    const handleExtract = () => {
      setOtNumber(`Asignación Automática`);
      setDate(new Date().toISOString().split("T")[0]);
      setShowForm(true);
    };

    const handleStartManual = () => {
      setCotizacionExtraida("");
      setOtNumber("Esperando selección...");
      setDate(""); 
      setShowForm(true);
    };

    const handleGenerateOT = async () => {
      if (!file) return setToast("⚠️ Por favor adjunta el archivo Excel primero.");
      
      setIsProcessing(true);
      setToast("⏳ Procesando documento y validando reglas de negocio...");

      try {
        let s3KeyTemp = "";
        
        const formData = new FormData();
        formData.append("file", file);
        formData.append("nombreArchivo", file.name);

        const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/api/v1/documentos/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${(session as any)?.user?.token}` },
          body: formData
        });
        
        if (!uploadRes.ok) throw new Error("Fallo al subir a MinIO.");
        s3KeyTemp = (await uploadRes.json()).rutaUrl; 

        const cotizObj = cotizaciones.find((c: any) => c.codigo === cotizacionSeleccionada);
        const idCotizacionReal = cotizObj ? cotizObj.idCotizacion : undefined; 

        const actionRes = await procesarImportacionOTAction({ s3KeyTemp, tipoFlujo, idCotizacion: idCotizacionReal });
        if (!actionRes.ok || !actionRes.id_job) throw new Error(actionRes.error || "Error de detonación del orquestador.");

        const interval = setInterval(async () => {
          const jobStatus = await consultarEstadoJobAction(actionRes.id_job!);
          if (jobStatus.status === 'COMPLETED') {
            clearInterval(interval);
            setToast("✅ OT importada y reglas validadas con éxito.");
            setIsProcessing(false);
            loadTable('ordenes_trabajo'); 
            setFile(null); setShowForm(false); setClient(""); setCotizacionSeleccionada("");
          } else if (jobStatus.status === 'FAILED') {
            clearInterval(interval);
            setToast(`❌ Error: ${jobStatus.data?.error || 'Fallo de importación o reglas de negocio.'}`);
            setIsProcessing(false);
          }
        }, 2500);
      } catch (err: any) {
        setToast(`❌ Error crítico: ${err.message}`);
        setIsProcessing(false);
      }
    };

    return (
      <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
        <ToastNotification message={toast} />
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800"><FileText size={20} className="text-blue-600" /> Importar Orden de Trabajo</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <FlowSelector tipoFlujo={tipoFlujo} onSelectFlow={(f) => { setTipoFlujo(f); setCotizacionSeleccionada(""); setShowForm(false); setFile(null); }} />
            <FileUploadZone tipoFlujo={tipoFlujo} file={file} showForm={showForm} onFileChange={(e: any) => setFile(e.target.files?.[0])} onRemoveFile={() => setFile(null)} onExtract={handleExtract} onStartManual={handleStartManual} />
            {showForm && (
              <OTFormSection tipoFlujo={tipoFlujo} cotizacionExtraida={cotizacionExtraida} otNumber={otNumber} date={date} client={client} cotizacionSeleccionada={cotizacionSeleccionada} recepciones={cotizacionesVinculables} isProcessing={isProcessing} onCotizacionChange={handleCotizacionChange} onGenerateOT={handleGenerateOT} />
            )}
          </div>
        </section>
        <OTTableSection generatedOTs={generatedOTs} />
      </div>
    );
  };

  export default MainRenderer2;