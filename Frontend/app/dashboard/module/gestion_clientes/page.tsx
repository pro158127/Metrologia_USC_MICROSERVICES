'use client';

// 1. IMPORTS
import React, { useEffect, useState } from "react";
import { Search, Plus, Eye, Edit, X, CheckCircle, CircleSlash, Upload, FileText, RefreshCw } from "lucide-react";
import { useSession } from "next-auth/react";
import { ClienteModel, useDbRealtime } from "@/app/componets/tables_recharge";
import { crearCliente, obtenerClientes, obtenerUltimaCotizacionFinalizada,crearDocumento, actualizarCliente ,cambiarEstadoCliente} from "@/app/action_module/modulo_cliente";
import { Perfil } from "../../page";
// Tipado formal para la navegación

interface MainRendererProps {
  changepage: Perfil;
}

const CIUDADES_COLOMBIA = [
  "Cali", "Bogotá", "Medellín", "Barranquilla", "Cartagena", 
  "Bucaramanga", "Pereira", "Manizales", "Cúcuta", "Santa Marta", 
  "Ibagué", "Pasto", "Palmira", "Buenaventura", "Popayán", 
  "Armenia", "Villavicencio", "Neiva", "Montería", "Tuluá"
] as const;

// 2. COMPONENTES HIJOS (EXTRAÍDOS)

/**
 * Cabecera del Modal con título dinámico
 */
const ModalHeader = ({
  isEditMode,
  razonSocial,
  onClose,
}: {
  isEditMode: boolean;
  razonSocial?: string;
  onClose: () => void;
}) => (
  <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
    <h3 className="text-base font-bold">
      {isEditMode ? `Editar Cliente: ${razonSocial}` : "Nuevo Cliente"}
    </h3>
    <button
      type="button"
      onClick={onClose}
      className="p-1 text-slate-400 hover:text-white transition-colors"
    >
      <X size={18} />
    </button>
  </div>
);

/**
 * Control de carga para adjuntar el RUT
 */
const RutFileInput = ({
  isEditMode,
  selectedFile,
  idRutDocumento,
  onFileChange,
}: {
  isEditMode: boolean;
  selectedFile: File | null;
  idRutDocumento: any;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="md:col-span-2">
    <label className="block text-slate-400 font-bold mb-1">
      {isEditMode ? "Documento RUT (Actualizar o Reemplazar)" : "Adjuntar Documento RUT *"}
    </label>
    <div className="relative flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 bg-slate-800/50 rounded-xl hover:border-[#5680F9] transition-colors cursor-pointer">
      <input
        type="file"
        accept=".pdf,png,.jpg,.jpeg"
        onChange={onFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        required={!isEditMode && !idRutDocumento}
      />
      {selectedFile ? (
        <div className="flex items-center gap-2 text-emerald-400 font-medium">
          <FileText size={18} />
          <span>Nuevo archivo: {selectedFile.name}</span>
        </div>
      ) : idRutDocumento ? (
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <FileText size={18} className="text-[#5680F9]" />
          <span>RUT Actual: {String(idRutDocumento)}</span>
          <RefreshCw size={14} className="text-slate-500 ml-2" />
          <span className="text-[10px] text-slate-500">(Haz clic para cambiar)</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <Upload size={20} className="text-[#5680F9]" />
          <span className="font-bold">Seleccionar o arrastrar RUT (PDF / Imagen)</span>
        </div>
      )}
    </div>
  </div>
);

/**
 * Formulario Modal de Creación / Edición
 */

import { CrearClienteInput,ActualizarClienteInput } from "@/app/action_module/modulo_cliente";
export const ClientFormModal = ({
  isOpen,
  client,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  client: ClienteModel | null;
  onClose: () => void;
  onSave: (data: Partial<any> & { rutFile?: File | null }, mode: "create" | "edit") => void;
}) => {
  if (!isOpen) return null;

  const isEditMode = client !== null;
  const [formData, setFormData] = useState<Partial<any>>(
    isEditMode
      ? { ...client }
      : {
          nitCedula: "",
          razonSocial: "",
          correo: "",
          nombreContacto: "",
          telefono: "",
          observacion: "",
          tipoCliente: "NATURAL",
          idRutDocumento: null,
          ciudad: "Cali",
        }
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(
      {
        ...formData,
        idRutDocumento: formData.idRutDocumento ?? null,
        rutFile: selectedFile,
      },
      isEditMode ? "edit" : "create"
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <ModalHeader isEditMode={isEditMode} razonSocial={client?.razonSocial} onClose={onClose} />
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Razón Social *</label>
              <input
                type="text"
                value={formData.razonSocial || ""}
                onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">NIT / Cédula *</label>
              <input
                type="text"
                value={formData.nitCedula || ""}
                onChange={(e) => setFormData({ ...formData, nitCedula: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Correo Electrónico *</label>
              <input
                type="email"
                value={formData.correo || ""}
                onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Nombre de Contacto</label>
              <input
                type="text"
                value={formData.nombreContacto || ""}
                onChange={(e) => setFormData({ ...formData, nombreContacto: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Teléfono</label>
              <input
                type="text"
                value={formData.telefono || ""}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Ciudad *</label>
              <select
                value={formData.ciudad || "Cali"}
                onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
                required
              >
                <option value="" disabled>Selecciona una ciudad</option>
                {CIUDADES_COLOMBIA.map((ciudad) => (
                  <option key={ciudad} value={ciudad}>{ciudad}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Tipo de Cliente</label>
              <select
                value={formData.tipoCliente || "NATURAL"}
                onChange={(e) => setFormData({ ...formData, tipoCliente: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
              >
                <option value="NATURAL">Natural</option>
                <option value="JURIDICO">Jurídico</option>
              </select>
            </div>
            <RutFileInput
              isEditMode={isEditMode}
              selectedFile={selectedFile}
              idRutDocumento={formData.idRutDocumento}
              onFileChange={handleFileChange}
            />
            <div className="md:col-span-2">
              <label className="block text-slate-400 font-bold mb-1">Observación</label>
              <textarea
                value={formData.observacion || ""}
                onChange={(e) => setFormData({ ...formData, observacion: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white outline-none focus:border-[#5680F9]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#5680F9] text-white font-bold hover:bg-[#4069E2] shadow-md transition-colors"
            >
              {isEditMode ? "Guardar Cambios" : "Crear Cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Fila individual de la tabla de clientes con la acción corregida
 */
const CustomerTableRow = ({
  c,
  permisos,
  handleEdit,
  handleToggleStatus,
  onSelectCliente,
    onVolver,
}: {
  c: any;
  permisos: any;
  handleEdit: (cliente: any) => void;
  handleToggleStatus: (id: number) => void;
   onSelectCliente: (id: number) => void;   // ← navega a perfil
  onVolver: () => void;    
}) => {
  const [fecha, setFecha] = useState<string>("Cargando...");

  useEffect(() => {
    let isMounted = true;
    obtenerUltimaCotizacionFinalizada(c.idCliente)
      .then((ultimo_date: any) => {
        if (!isMounted) return;
        const fechaFormateada = ultimo_date?.data
          ? new Date(ultimo_date.data).toLocaleDateString("es-CO")
          : "Sin servicio";
        setFecha(fechaFormateada);
      })
      .catch(() => {
        if (isMounted) setFecha("Sin servicio");
      });

    return () => {
      isMounted = false;
    };
  }, [c.idCliente]);

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-4 py-3.5 font-bold text-slate-700">{c.razonSocial}</td>
      <td className="px-4 py-3.5 text-slate-500 font-mono">{c.nitCedula}</td>
      <td className="px-4 py-3.5 text-slate-500">{c.ciudad}</td>
      <td className="px-4 py-3.5 text-slate-500 font-mono">{c.telefono}</td>
      <td className="px-4 py-3.5 text-slate-400 font-mono">{fecha}</td>
      <td className="px-4 py-3.5">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
            c.estado === "ACTIVO"
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-rose-50 text-rose-700 border-rose-100"
          }`}
        >
          {c.estado}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          {permisos?.clientes?.ver_historial === true && (
            <button
              type="button"
              onClick={() => {
                onSelectCliente(c.idCliente);
              }}
              className="p-1.5 rounded-lg bg-blue-50 text-[#5680F9] hover:bg-blue-100 transition-colors"
              title="Ver Perfil"
            >
              <Eye size={14} />
            </button>
          )}

          {permisos?.clientes?.crear_editar === true && (
            <button
              type="button"
              onClick={() => handleEdit(c)}
              className="p-1.5 rounded-lg bg-violet-50 text-[#9A8CF3] hover:bg-violet-100 transition-colors"
              title="Editar"
            >
              <Edit size={14} />
            </button>
          )}

          {permisos?.clientes?.desactivar === true && (
            <button
              type="button"
              onClick={() => handleToggleStatus(c.idCliente)}
              className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
              title="Cambiar estado"
            >
              {c.estado === "ACTIVO" ? <CircleSlash size={14} /> : <CheckCircle size={14} />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

/**
 * Controles de filtrado y acciones superiores
 */
const ClientControls = ({
  search,
  setSearch,
  filter,
  setFilter,
  onNewClient,
  permisos,
}: {
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  onNewClient: () => void;
  permisos: any;
}) => (
  <div className="flex items-center gap-3 mb-4 flex-wrap">
    <div className="relative flex-1 min-w-64">
      <Search size={15} color="#9CA3AF" className="absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por razón social, NIT..."
        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-medium placeholder:text-slate-400 outline-none transition focus:border-[#5680F9]"
      />
    </div>
    <div className="flex gap-1">
      {["Todos", "Activos", "Inactivos"].map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFilter(f)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
            filter === f
              ? "bg-[#5680F9] border-[#5680F9] text-white"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
    {permisos?.clientes?.crear_editar === true && (
      <button
        type="button"
        onClick={onNewClient}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#5680F9] text-white text-xs font-bold shadow-md hover:bg-[#4069E2]"
      >
        <Plus size={15} /> Nuevo cliente
      </button>
    )}
  </div>
);

// 3. COMPONENTE PADRE (MainRenderer)
interface ModuloActivoProps {
               // ← el ID del cliente seleccionado
  onSelectCliente: (id: number) => void;   // ← navega a perfil
  onVolver: () => void;                    // ← vuelve a lista
}
export function MainRenderer({ onSelectCliente,onVolver }:ModuloActivoProps ) {
  const { dbState, setDbState } = useDbRealtime();
  const { clientes } = dbState;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const { data: session } = useSession();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClienteModel | null>(null);

  const handleEdit = (client: ClienteModel) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const handleNewClient = () => {
    setSelectedClient(null);
    setIsModalOpen(true);
  };

  const handleSave = async(data: Partial<any>, mode: "create" | "edit") => {
    const formData = new FormData();
    let url_ar="";
    if (mode === "create") {
    if (data.rutFile) {
        formData.append("file", data.rutFile as Blob); // Ajusta la clave si tu backend espera otro nombre
      }

      try {
        const response = await fetch("/api/v1/documentos/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }

        const result = await response.json();
        console.log("Archivo subido con éxito:", result);

        // Mapea la propiedad correcta que retorne tu endpoint
        url_ar = result.rutaUrl || result.url || result.data?.rutaUrl || "";
      } catch (error) {
        console.error("Error al subir el archivo:", error);
        return; // Detiene la ejecución si falla el upload
      }

      console.log("Crear cliente con datos:", data, "Ruta URL:", url_ar);
      try{
        const resul1=crearDocumento({nombre:`Rut_${data.nitCedula}`,rutaUrl:url_ar,mimeType:(data.rutFile as File).type,proveedor:"AWS_S3"});
        console.log("Resultado de crearDocumento:", await resul1, "Ruta URL:", url_ar);
        const result = await crearCliente({correo:data.correo, nitCedula:data.nitCedula, razonSocial:data.razonSocial, nombreContacto:data.nombreContacto, telefono:data.telefono, observacion:data.observacion, tipoCliente:data.tipoCliente, idRutDocumento:(await resul1).data?.idDocumento, ciudad:data.ciudad});
        if (!result.success) throw new Error(result.error || "Error al crear cliente");
      }

      catch(error){
        console.error("Error al crear cliente:", error);
      }

    }
    if (mode === "edit") {
      // Lógica para actualizar un cliente existente
      console.log("Actualizar cliente con datos:", data);
      try{
        const result = await actualizarCliente(data.idCliente, {correo:data.correo, nitCedula:data.nitCedula, razonSocial:data.razonSocial, nombreContacto:data.nombreContacto, telefono:data.telefono, observacion:data.observacion, tipoCliente:data.tipoCliente, idRutDocumento:data.idRutDocumento, ciudad:data.ciudad});
        if (!result.success) throw new Error(result.error || "Error al actualizar cliente");
      }
      catch(error){
        console.error("Error al actualizar cliente:", error);
      }
    }




    setIsModalOpen(false);
  };

  const handleToggleStatus = (id: number) => {
    try{
      cambiarEstadoCliente(id, clientes.find((c: any) => c.idCliente === id)?.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO")
      .then((result) => {
        if (!result.success) throw new Error(result.error || "Error al cambiar estado del cliente");
        console.log("Estado del cliente cambiado con éxito:", result);
      })
      .catch((error) => {
        console.error("Error al cambiar estado del cliente:", error);
      }); 
    }
    catch(error){
      console.error("Error al cambiar estado del cliente:", error);
    }


  };

  const filtered = clientes.filter((c: any) => {
    const matchSearch =
      c.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
      c.nitCedula.includes(search);
    return matchSearch && (filter === "Todos" || c.estado === (filter === "ACTIVO" ? "ACTIVO" : "INACTIVO"));
  });

  const permisos = session?.user?.permissions?.permisos;

  useEffect(() => {
    async function inital() {
      try {
        const result = await obtenerClientes();
        if (!result.success) throw new Error("Error al consultar clientes");
        const data = result?.data;

        const format_data = data?.map((b: any): any => ({
          correo: b.correo,
          nitCedula: b.nitCedula,
          razonSocial: b.razonSocial,
          idCliente: b.idCliente,
          idRutDocumento: b.idRutDocumento,
          estado: b.status,
          nombreContacto: b.nombreContacto,
          observacion: b.observacion,
          telefono: b.telefono,
          tipoCliente: b.tipoCliente,
          ciudad: b.ciudad ?? "sin ciudad",
          createat: new Date(b.createat).toLocaleDateString("es-CO"),
          updatedAt: new Date(b.updatedAt).toLocaleDateString("es-CO"),
        }));

        setDbState((prevdata: any): any => ({
          ...prevdata,
          clientes: format_data ?? [],
        }));
      } catch (error) {
        console.error(error);
      }
    }
    inital();
  }, [setDbState]);

  return (
    <div className="w-full bg-transparent p-4">
      <ClientControls
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        onNewClient={handleNewClient}
        permisos={permisos}
      />

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Razón Social", "NIT", "Ciudad", "Teléfono", "Último servicio", "Estado", "Acciones"].map((h) => (
                <th key={h} className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c: any) => (
              <CustomerTableRow
                key={c.idCliente}
                c={c}
                permisos={permisos}
                handleEdit={handleEdit}
                handleToggleStatus={handleToggleStatus}
                onSelectCliente={onSelectCliente}
                onVolver={onVolver}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ClientFormModal
        isOpen={isModalOpen}
        client={selectedClient}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

// 4. EXPORTACIÓN POR DEFECTO
export default MainRenderer;