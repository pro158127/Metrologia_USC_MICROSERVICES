

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Shield, X, Check, Search, FileSpreadsheet } from "lucide-react";

import { actualizarUsuarioGenerico, crearUsuarioGenerico, restablecerContrasenaGenerico, obtenerBitacoraPorPermiso, eliminarUsuario, restaurarUsuario } from "@/app/action_module/administration";

import type {
  AdminTab,
  ConfigSection,
  init_bitacora,
  ToastProps,
  FormUsuario,
  ModalUsuarioProps,
  TabUsuariosProps,
  TipoRol,
  TipoModulo,
  FiltrosBitacora,
  tab_bitacora,
  TabConfiguracionProps,
  uso_rol,
  RolColorMap,
} from "@/tipos/administracion";
import type { ParametroSistemaModel } from "@/tipos/entidades";

const PALETA_ROLES: { bg: string; color: string }[] = [
  { bg: "#DBEAFE", color: "#1D4ED8" },
  { bg: "#DCFCE7", color: "#15803D" },
  { bg: "#EDE9FE", color: "#7C3AED" },
  { bg: "#FEF3C7", color: "#D97706" },
  { bg: "#FCE7F3", color: "#BE185D" },
  { bg: "#E0F2FE", color: "#0369A1" },
];

const OPCIONES_FRECUENCIA = ["UNA_VEZ", "DIARIA", "SEMANAL", "PROGRAMADA_CRON"] as const;

// ==========================================
// 3. SUB-COMPONENTES DE RENDERIZADO INTERNO
// ==========================================

function RenderToast({ message }: ToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl" style={{ background: "#1F2A44", color: "#FFFFFF", fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
      {message}
    </div>
  );
}

function RenderModalUsuario({ editingUser, form, setForm, onClose, onSave, rolColors }: ModalUsuarioProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="rounded-xl p-6 w-full max-w-md" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div className="flex items-center justify-between mb-5">
          <span style={{ color: "#1F2A44", fontSize: 16, fontWeight: 600 }}>
            {editingUser ? "Editar usuario" : "Nuevo usuario"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color="#94A3B8" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {[
            { label: "Nombre completo *", key: "nombre" as const, placeholder: "Juan García Herrera" },
            { label: "Correo institucional *", key: "correo" as const, placeholder: "juan.garcia@usc.edu.co", type: "email" },
          ].map((f) => (
            <div key={f.key}>
              <label style={{ color: "#374151", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 5 }}>{f.label}</label>
              <input
                type={f.type || "text"}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2.5 rounded-lg"
                style={{ border: "1px solid #CBD2E1", fontSize: 13,color: "#1F2937", outline: "none" }}
              />
            </div>
          ))}

          <div>
            <label style={{ color: "#374151", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 5 }}>Rol *</label>
            <select
              value={form.rol}
              onChange={(e) => setForm((prev) => ({ ...prev, rol: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg"
              style={{ border: "1px solid #CBD2E1", fontSize: 13, outline: "none", background: "#FFFFFF" }}
            >
              {Object.keys(rolColors).map((r) => <option key={r}>{r}</option>)}
            </select>
            {form.rol && (
              <div className="mt-2 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full" style={{ background: rolColors[form.rol]?.bg, color: rolColors[form.rol]?.color, fontSize: 11, fontWeight: 600 }}>
                  {form.rol}
                </span>
                <span style={{ color: "#94A3B8", fontSize: 12 }}>Vista previa del badge</span>
              </div>
            )}
          </div>

          <div>
            <label style={{ color: "#374151", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 5 }}>Estado inicial</label>
            <div className="flex gap-3">
              {[true, false].map((v) => (
               <button
  key={String(v)}
  onClick={() => setForm((prev) => ({ ...prev, estado: v }))}
  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all"
  style={{
    background: form.estado === v ? "#EEF2FF" : "#F5F7FA",
    border: `2px solid ${form.estado === v ? "#5680F9" : "#E6EAF2"}`,
    color: form.estado === v ? "#5680F9" : "#94A3B8",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  }}
>
  {v ? (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
      Activo
    </>
  ) : (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
      </svg>
      Inactivo
    </>
  )}
</button>
              ))}
            </div>
          </div>
        </div>

        {!editingUser && (
          <div className="mt-4 p-3 rounded-lg" style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            <span style={{ color: "#3730A3", fontSize: 12 }}>⚠️ El usuario recibirá sus credenciales de acceso y contraseña temporal por correo institucional.</span>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg" style={{ border: "1px solid #CBD2E1", color: "#1F2A44", background: "none", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={onSave} className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg" style={{ background: "#5680F9", color: "#FFFFFF", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer" }}>
            <Check size={14} /> {editingUser ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}


function RenderTabUsuarios({
  search,
  setSearch,
  filteredUsers,
  openCreate,
  openEdit,
  toggleEstado,
  showToast,
  rolColors,
}: TabUsuariosProps) {
  const [loadingResetId,setLoadingResetId] =
useState<number | null>(null);
const [showDeleted, setShowDeleted] = useState(false);
const [loadingrestaurar,setRestaurar]=useState<number | null>(null);
const [elemianarloading,setEleminar]=useState<number | null>(null);
const activeUsers = useMemo(() => filteredUsers.filter((u) => !u.elminado), [filteredUsers]);
const deletedUsers = useMemo(() => filteredUsers.filter((u) => u.elminado), [filteredUsers]);



console.log(filteredUsers)
  return (
    <div className="w-full px-2 md:px-0">
      {/* Barra de herramientas superior (Responsiva: Apilada en móvil, en línea en md) */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search size={14} color="#64748B" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o rol..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-slate-950 placeholder:text-slate-400"
            style={{
              border: "1px solid #CBD2E1",
              background: "#FFFFFF",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        
        <div className="flex items-center justify-between md:justify-start gap-4 w-full md:w-auto">
          <span style={{ color: "#475569", fontSize: 13, fontWeight: 500 }}>
            {filteredUsers.length} usuarios
          </span>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg transition-all"
            style={{
              background: "#5680F9",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Nuevo usuario
          </button>
        </div>
      </div>

      {/* Contenedor de la Tabla con scroll horizontal garantizado en pantallas pequeñas */}
    <div
  className="w-full rounded-2xl overflow-hidden"
  style={{
    background: "#fff",
    border: "1px solid #E2E8F0",
    boxShadow:
      "0 10px 30px rgba(15,23,42,0.08)",
  }}
>
  <div className="overflow-x-auto max-h-[650px]">
    <table className="w-full min-w-[950px] border-collapse">

      <thead className="sticky top-0 z-10">
        <tr
          style={{
            background:
              "linear-gradient(90deg,#F8FAFC,#EEF2FF)",
          }}
        >
          {[
            "Nombre",
            "Correo institucional",
            "Rol",
            "Estado",
            "Último acceso",
            "Acciones",
          ].map((h)=>(
            <th
              key={h}
              className="px-6 py-4 text-left"
              style={{
                color:"#475569",
                fontSize:11,
                fontWeight:800,
                letterSpacing:"0.08em"
              }}
            >
              {h.toUpperCase()}
            </th>
          ))}
        </tr>
      </thead>


      <tbody className="divide-y divide-slate-100">

      {activeUsers.map((u,i)=> {
        
        const rc =
        rolColors[u.rolnombre] ||
        {
          bg:"#F1F5F9",
          color:"#334155"
        };
        const rowKey = u.idUsuario ?? `user-row-${i}`;
        return (
          
        <tr
          key={rowKey}
          className="
          transition-all
          hover:bg-slate-50
          "
          style={{
            background:
            i%2===0
            ?"white"
            :"#FCFCFD"
          }}
        >


        {/* Usuario */}
        <td className="px-6 py-4">

          <div className="flex items-center gap-3">

            <div
            className="
            w-10 h-10
            rounded-full
            flex items-center
            justify-center
            "
            style={{
              background:rc.bg,
              color:rc.color,
              fontWeight:800,
              fontSize:13
            }}
            >

            {
            u.nombreCompleto
            .split(" ")
            .map(n=>n[0])
            .join("")
            .slice(0,2)
            .toUpperCase()
            }

            </div>


            <div>
              <p
              className="font-semibold"
              style={{
                color:"#0F172A",
                fontSize:14
              }}
              >
              {u.nombreCompleto}
              </p>

              <p
              className="text-xs text-slate-400"
              >
              Usuario registrado
              </p>

            </div>


          </div>

        </td>



        {/* correo */}
        <td
        className="px-6 py-4"
        style={{
          color:"#475569",
          fontSize:13
        }}
        >
          {u.correo}
        </td>



        {/* rol */}

        <td className="px-6 py-4">

          <span
          className="
          px-3 py-1
          rounded-full
          "
          style={{
            background:rc.bg,
            color:rc.color,
            fontSize:11,
            fontWeight:700
          }}
          >

          {u.rolnombre}

          </span>

        </td>



        {/* Estado */}

        <td className="px-6 py-4">

        <button
        onClick={()=>toggleEstado(
          u.idUsuario,
          u.estado
        )}
        className="flex items-center gap-2"
        >

        <div
        className="
        relative
        w-10 h-5
        rounded-full
        "
        style={{
          background:
          u.estado
          ?" #22C55E"
          :"#CBD5E1"
        }}
        >

          <div
          className="
          absolute
          top-0.5
          w-4 h-4
          rounded-full
          bg-white
          shadow
          transition-all
          "
          style={{
            left:u.estado
            ?"22px"
            :"2px"
          }}
          />

        </div>


        <span
        className="text-xs font-semibold"
        >
        {
          u.estado
          ?"Activo"
          :"Inactivo"
        }
        </span>


        </button>

        </td>




        {/* Fecha */}

        <td
        className="px-6 py-4"
        style={{
          fontFamily:"monospace",
          fontSize:12,
          color:"#64748B"
        }}
        >

        {u.updatedAt ? u.updatedAt.toLocaleString() : "—"}

        </td>




        {/* acciones */}

        <td className="px-6 py-4">


        <div className="flex gap-2">


        {/* editar */}

        <button
        onClick={()=>openEdit(u)}
        className="
        flex items-center gap-2
        px-3 py-2
        rounded-xl
        text-xs
        font-semibold
        transition
        "
        style={{
          background:"#EEF2FF",
          color:"#4F46E5"
        }}
        >

        <svg width="14" height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        >
        <path d="M12 2a2 2 0 0 1 3 3L6 14l-4 1 1-4Z"/>
        </svg>

        Editar

        </button>



        {/* reset password */}

        <button
        disabled={
          loadingResetId===u.idUsuario
        }
        onClick={async()=>{

        setLoadingResetId(
          u.idUsuario
        );

        await restablecerContrasenaGenerico(
          u.idUsuario
        );

        setLoadingResetId(null);

        showToast(
        "Contraseña temporal enviada"
        );

        }}
        className="
        flex items-center gap-2
        px-3 py-2
        rounded-xl
        text-xs
        font-semibold
        "
        style={{
          background:"#fff",
          border:"1px solid #CBD5E1",
          color:"#334155"
        }}
        >


        {
        loadingResetId===u.idUsuario
        ?

        <svg
        className="animate-spin"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        >
        <circle
        cx="12"
        cy="12"
        r="10"
        strokeWidth="3"
        />
        </svg>

        :

        <svg
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        >
        <path d="M12 15v2"/>
        <path d="M8 11V8a4 4 0 1 1 8 0v3"/>
        <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        />
        </svg>

        }


        {
        loadingResetId===u.idUsuario
        ?
        "Restableciendo..."
        :
        "Restablecer contraseña"
        }


        </button>




        {/* eliminar */}

        <button
        disabled={
          elemianarloading==u.idUsuario
        }
        onClick={async()=>{
          setEleminar(u.idUsuario)
          try{
         const a=await eliminarUsuario({idUsuario:u.idUsuario})}
          catch(error){
           showToast("Algo sucedio ,contacta al administrador")
          }

          finally{
            setEleminar(null)
          }

        }}
        className="
        flex items-center gap-2
        px-3 py-2
        rounded-xl
        text-xs
        font-semibold
        transition
        "
        style={{
          background:"#FEF2F2",
          color:"#DC2626"
        }}
        >
            
       
        {elemianarloading===u.idUsuario?
      
          <svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle
    cx="12"
    cy="12"
    r="9"
    stroke="currentColor"
    strokeWidth="3"
    opacity="0.2"
  />
  <path
    d="M12 3a9 9 0 0 1 9 9"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
  >
    <animateTransform
      attributeName="transform"
      type="rotate"
      from="0 12 12"
      to="360 12 12"
      dur="0.8s"
      repeatCount="indefinite"
    />
  </path>
</svg>
        :
         <svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
></svg>
        
      
      }

      eleminar 
        

        </button>


        </div>

        </td>


        </tr>

        )

      }   )}

      <tr
    className="cursor-pointer hover:bg-slate-50 transition"
    onClick={() => setShowDeleted(!showDeleted)}
>
    <td
        colSpan={6}
        className="px-6 py-4"
    >
        <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

                <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                        background: "#FEE2E2",
                        color: "#B91C1C"
                    }}
                >
                    {deletedUsers.length}
                </span>

                <span
                    className="font-semibold"
                    style={{
                        color: "#991B1B"
                    }}
                >
                    Usuarios eliminados
                </span>

            </div>

            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                    transform: showDeleted
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    transition: ".25s"
                }}
            >
                <path d="m6 9 6 6 6-6"/>
            </svg>

        </div>
    </td>
</tr>

{showDeleted &&
deletedUsers.map((u) => (

<tr
    key={u.idUsuario}
    style={{
        background: "#FFF7F7"
    }}
>

    <td className="px-6 py-4">

        <div className="flex items-center gap-3">

            <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                    background: "#FEE2E2",
                    color: "#DC2626",
                    fontWeight: 800
                }}
            >
                X
            </div>

            <div>

                <p className="font-semibold text-red-700">
                    {u.nombreCompleto}
                </p>

                <p className="text-xs text-red-500">
                    Usuario eliminado
                </p>

            </div>

        </div>

    </td>

    <td className="px-6 py-4">
        {u.correo}
    </td>

    <td className="px-6 py-4">

        <span
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{
                background: "#FEE2E2",
                color: "#B91C1C"
            }}
        >
            Eliminado
        </span>

    </td>

    <td className="px-6 py-4">
        —
    </td>

    <td className="px-6 py-4">
        {u.updatedAt ? u.updatedAt.toLocaleString() : "—"}
    </td>

    <td className="px-6 py-4">

        <button
        
            className="px-3 py-2 rounded-xl cursor-pointer"
            style={{
                background: "#DCFCE7",
                color: "#166534",
                
            }}
            onClick={
              async()=>{
          setRestaurar(u.idUsuario)
          try{
         const a=await restaurarUsuario({idUsuario:u.idUsuario})}
          catch(error){
           showToast("Algo sucedio ,contacta al administrador")
          }

          finally{
            setRestaurar(null)
          }

        }

            }
        >
          {loadingrestaurar===u.idUsuario ? <p>restaurando....</p>:<p>restaurar</p>}
           

            
        </button>

    </td>

</tr>

))}


      </tbody>




    </table>

  </div>

</div>
      {/* Leyenda inferior de Roles */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
        <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>Roles registrados:</span>
        {Object.entries(rolColors).map(([rol, style]) => (
          <span
            key={rol}
            className="px-2.5 py-1 rounded-full font-bold"
            style={{ background: style.bg, color: style.color, fontSize: 11 }}
          >
            {rol}
          </span>
        ))}
      </div>
    </div>
  );
}

function RenderTabBitacora({info_bitacora,recarga,token}:tab_bitacora) {

  const rolesDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          info_bitacora
            ?.map((item) => item.rol) // Cambia 'item.rol' si la propiedad en tu base de datos tiene otro nombre
            .filter((rol): rol is string => Boolean(rol)) // Filtramos valores null, undefined o vacíos
        )
      ),
    [info_bitacora]
  );

const usuariosDisponibles = useMemo(
  () =>
    Array.from(
      new Set(
        info_bitacora
          ?.map((item) => item.usuario) // Ajusta 'item.usuario' si en tu objeto se llama 'usuario_nombre' o similar
          .filter((usuario): usuario is string => Boolean(usuario))
      )
    ),
  [info_bitacora]
);

const modulosDisponibles = useMemo(
  () =>
    Array.from(
      new Set(
        info_bitacora
          ?.map((item) => item.modulo) // Cambia 'item.modulo' si la propiedad en la bitácora tiene otro nombre (ej. item.module o item.seccion)
          .filter((modulo): modulo is string => Boolean(modulo)) // Filtramos nulos, undefined o vacíos
      )
    ),
  [info_bitacora]
);
  // 2. Inicializamos el estado con los tipos estrictos
  const [filtros, setFiltros] = useState<FiltrosBitacora>({
    usuario: "",
    modulo: "",
    rol: "",
    fecha: ""
  });

  const [estaRecargando,setestaRecargando]=useState<boolean>(false);
const [exportando, setExportando] = useState(false);
 // 3. Formateo seguro de fecha (Evita el error de zona horaria UTC -> GMT)
  const fechaFiltroFormateada = useMemo(() => {
    if (!filtros.fecha) return "";
    const [year, month, day] = filtros.fecha.split("-");
    if (!year || !month || !day) return "";
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year.slice(-2)}`; 
    // Genera el formato "DD/MM/YY", idéntico a toLocaleDateString('es-ES')
  }, [filtros.fecha]);

  // 4. CÁLCULO DERIVADO (Sin useEffect ni setInforamtion extra)
  const filterinFormation = useMemo(
    () =>
      (info_bitacora || []).filter((item) => {
        // A. Filtro por Usuario
        const matchUsuario =
          filtros.usuario === "" ||
          item.usuario?.toLowerCase().includes(filtros.usuario.trim().toLowerCase());

        // B. Filtro por Módulo
        const matchModulo =
          filtros.modulo === "" || item.modulo === filtros.modulo;

        // C. Filtro por Rol
        const matchRol =
          filtros.rol === "" || item.rol === filtros.rol;

        // D. Filtro por Fecha
        const fechaItem = item.fecha ? item.fecha.split(" ")[0] : "";
        const matchFecha =
          fechaFiltroFormateada === "" || fechaItem.includes(fechaFiltroFormateada);

        return matchUsuario && matchModulo && matchRol && matchFecha;
      }),
    [info_bitacora, filtros, fechaFiltroFormateada]
  );

  // Manejador para actualizar inputs/selects de filtro
  const handleFiltroChange = (campo: keyof FiltrosBitacora, valor: string) => {
    setFiltros((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };
  console.log("token",token)
  // 5. Descarga de reporte Excel

  const urls=process.env.NEXT_PUBLIC_API_URL;
  console.log(urls)
  const handleExportarExcel = async () => {
    setExportando(true);

    try {
      console.log(filtros)
    const response = await fetch(`${urls}/api/audit/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(filtros),
  });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error detallado del servidor:", errorText);

        if (errorText.startsWith("<!DOCTYPE") || errorText.includes("<html")) {
          alert("Error 500: El servidor falló al procesar el archivo.");
        } else {
          alert(`Error al exportar: ${errorText}`);
        }
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const fechaHoy = new Date().toISOString().split("T")[0];
      a.download = `bitacora_auditoria_${fechaHoy}.xlsx`;

      document.body.appendChild(a);
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al descargar el reporte Excel:", error);
      alert("Ocurrió un error inesperado al descargar el reporte.");
    } finally {
      setExportando(false);
    }
  }; // 🔄 Se ejecuta automáticamente cuando cambian los filtros o la bitácora base
  return (
    <div className="w-full px-2 md:px-0">
      {/* Alerta de Seguridad Inmutable */}
      <div 
        className="flex items-start md:items-center gap-3 p-3.5 mb-5 rounded-xl" 
        style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}
      >
        <Shield size={18} color="#DC2626" className="shrink-0 mt-0.5 md:mt-0" />
        <span style={{ color: "#991B1B", fontSize: 13, fontWeight: 500, lineHeight: "1.4" }}>
          Esta bitácora es inmutable. Ningún usuario puede modificar o eliminar sus registros.
        </span>
      </div>

      {/* Panel de Filtros Responsivo */}
      <div className="flex flex-col gap-3 mb-5 p-4 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#1E293B" }}>
          Filtrar registros de auditoría
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. Filtro: Usuario (Nombre) */}
        <div className="flex flex-col gap-1">
  <label style={{ color: "#1E293B", fontSize: 12, fontWeight: 600 }}>
    Usuario / Nombre
  </label>
  
  <input 
    type="text" 
    placeholder="Buscar o seleccionar usuario..." 
    value={filtros.usuario}
    onChange={(e) => handleFiltroChange("usuario", e.target.value)}
    // 1. Enlazamos el input con el datalist de abajo usando el ID único:
    list="sugerencias-usuarios"
    className="w-full px-3 py-2.5 rounded-lg text-slate-900 placeholder:text-slate-400" 
    style={{ 
      border: "1px solid #CBD2E1", 
      fontSize: 13, 
      outline: "none", 
      background: "#FFFFFF", 
      color: "#0F172A" 
    }} 
  />

  {/* 2. El datalist contiene las opciones interactivas */}
  <datalist id="sugerencias-usuarios">
    {usuariosDisponibles.map((usuario) => (
      <option key={usuario} value={usuario} />
    ))}
  </datalist>
</div>

          {/* 2. Filtro: Módulo (Select Tipado) */}
          <div className="flex flex-col gap-1">
            <label style={{ color: "#1E293B", fontSize: 12, fontWeight: 600 }}>Módulo</label>
           <select
  value={filtros.modulo} // Asegúrate de que coincida con tu estado de filtros (ej. filtros.modulo)
  onChange={(e) => handleFiltroChange("modulo", e.target.value as TipoModulo)}
  className="w-full px-3 py-2.5 rounded-lg text-slate-900"
  style={{ 
    border: "1px solid #CBD2E1", 
    fontSize: 13, 
    outline: "none", 
    background: "#FFFFFF", 
    color: "#0F172A" 
  }}
>
  <option value="">Todos los módulos</option>
  {modulosDisponibles.map((modulo) => (
    <option key={modulo} value={modulo}>
      {modulo}
    </option>
  ))}
</select>
          </div>

          {/* 3. Filtro: Rol (Select Tipado) */}
          <div className="flex flex-col gap-1">
            <label style={{ color: "#1E293B", fontSize: 12, fontWeight: 600 }}>Rol de usuario</label>
            <select
          value={filtros.rol}
          onChange={(e) => handleFiltroChange("rol", e.target.value as TipoRol)}
          className="w-full px-3 py-2.5 rounded-lg text-slate-900"
          style={{ 
            border: "1px solid #CBD2E1", 
            fontSize: 13, 
            outline: "none", 
            background: "#FFFFFF", 
            color: "#0F172A" 
          }}
        >
          <option value="">Todos los roles</option>
          {rolesDisponibles.map((rol) => (
            <option key={rol} value={rol}>
              {rol}
            </option>
          ))}
        </select>
          </div>

          {/* 4. Filtro: Fecha */}
          <div className="flex flex-col gap-1">
            <label style={{ color: "#1E293B", fontSize: 12, fontWeight: 600 }}>Fecha específica</label>
            <input 
              type="date" 
              value={filtros.fecha}
              onChange={(e) => handleFiltroChange("fecha", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-slate-900" 
              style={{ border: "1px solid #CBD2E1", fontSize: 13, outline: "none", background: "#FFFFFF", color: "#0F172A" }} 
            />
          </div>
        </div>

        {/* Botonera de Acciones (Apilada en celulares, en línea en escritorio) */}
        <div className="flex flex-col sm:flex-row gap-2 mt-2 sm:justify-end">
       
          
  <button
  onClick={handleExportarExcel}
  disabled={exportando}
  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-lg text-sm transition-all duration-200 shadow-sm active:scale-95"
>
  {exportando ? (
    <>
      {/* Spinner de carga animado cuando está procesando */}
      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Generando...</span>
    </>
  ) : (
    <>
      {/* Icono de Lucide React para Excel/Hojas de cálculo */}
      <FileSpreadsheet className="h-4.5 w-4.5" />
      <span>Exportar a Excel</span>
    </>
  )}
</button>

<button
  onClick={async () => {
    setestaRecargando(true);
    try {
      await recarga();
    } finally {
      setestaRecargando(false);
    }
  }}
  disabled={estaRecargando}
  className={`
    group relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm
    transition-all duration-300 ease-in-out
    ${estaRecargando 
      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
      : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 active:scale-95"
    }
  `}
>
  {/* CONTENEDOR DE ICONOS */}
  <div className="relative w-5 h-5 flex items-center justify-center">
    
    {/* SVG 1: Recargar (Visible por defecto, desaparece al cargar) */}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={`w-5 h-5 absolute transition-all duration-300 ${
        estaRecargando ? "opacity-0 scale-75 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>

    {/* SVG 2: Loading / Spinner (Aparece y gira infinitamente al cargar) */}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={`w-5 h-5 absolute animate-spin transition-all duration-300 ${
        estaRecargando ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
      }`}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    
  </div>

  {/* TEXTO DINÁMICO */}
  <span>
    {estaRecargando ? "Cargando..." : "Recargar"}
  </span>
</button>



        </div>
      </div>

      {/* Contenedor con Scroll Horizontal en móvil */}


<div 
  className="w-full rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-100/50 overflow-hidden"
>
  {/* CONTENEDOR CON SCROLL GENERAL (Horizontal para móviles, Vertical limitado para muchos datos) */}
  <div className="w-full overflow-x-auto overflow-y-auto max-h-[550px] scrollbar-thin scrollbar-thumb-slate-200">
    <table className="w-full min-w-[900px] border-separate border-spacing-0">
      <thead>
        <tr className="bg-slate-50/70 backdrop-blur-md sticky top-0 z-10 transition-colors">
          {["Fecha / Hora", "Usuario", "Rol", "Acción realizada", "Módulo", "Dirección IP"].map((h, idx) => (
            <th 
              key={h} 
              className={`
                text-left px-5 py-4 text-[11px] font-bold tracking-wider text-slate-500 uppercase
                border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm sticky top-0
                ${idx === 0 ? "rounded-tl-2xl" : ""}
                ${idx === 5 ? "rounded-tr-2xl" : ""}
              `}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      
      <tbody className="divide-y divide-slate-100 bg-white">
        {filterinFormation.map((b, i) => (
          <tr 
            key={i} 
            className="hover:bg-slate-50/80 transition-all duration-200 group"
          >
            {/* 1. Fecha / Hora */}
            <td className="px-5 py-3.5 whitespace-nowrap">
              <span className="text-[12px] font-mono font-medium text-slate-500 bg-slate-100/60 px-2 py-1 rounded-md border border-slate-200/40">
                {b.fecha}
              </span>
            </td>
            
            {/* 2. Usuario */}
            <td className="px-5 py-3.5 whitespace-nowrap">
              <div className="flex items-center gap-2.5">
                {/* Micro avatar con las iniciales o genérico para look premium */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] border border-slate-200">
                  {b.usuario?.charAt(0).toUpperCase() || "U"}
                </div>
                <span className="text-sm font-semibold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">
                  {b.usuario}
                </span>
              </div>
            </td>
            
            {/* 3. Rol */}
            <td className="px-5 py-3.5 whitespace-nowrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-100/80 shadow-sm shadow-indigo-100/30">
                {b.rol}
              </span>
            </td>
            
            {/* 4. Acción realizada */}
            <td className="px-5 py-3.5">
              <span className="text-sm font-medium text-slate-600 line-clamp-1 group-hover:text-slate-900 transition-colors">
                {b.accion}
              </span>
            </td>
            
            {/* 5. Módulo */}
            <td className="px-5 py-3.5 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {b.modulo}
              </span>
            </td>
            
            {/* 6. Dirección IP */}
            <td className="px-5 py-3.5 whitespace-nowrap">
              <span className="text-xs font-mono font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
                {b.ip}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  
  {/* FOOTER DE CONTEO (Opcional, pero le da el toque final premium) */}
  <div className="bg-slate-50/50 px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
    <span>Mostrando {filterinFormation.length} registros de auditoría</span>
    <span className="text-slate-400">Actualizado en tiempo real</span>
  </div>
</div>
    </div>
  );
}
////////////////configuraciom



// Íconos SVG vectoriales unificados (Stroke uniformizado a 1.75px)
const DocumentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const StampIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751A11.959 11.959 0 0012 2.714z" />
  </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 12h8.25" />
  </svg>
);

export default function RenderTabConfiguracion({ configSection, setConfigSection }: TabConfiguracionProps) {
  const menuItems = [
    { key: "plantillas", label: "Plantillas de documentos", icon: DocumentIcon },
    { key: "sello", label: "Sello y marca de agua", icon: StampIcon },
    { key: "parametros", label: "Parámetros del sistema", icon: SettingsIcon },
  ] as const;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Menú Segmentado (Segmented Control Pattern) */}
      <nav 
        aria-label="Pestañas de configuración"
        className="flex items-center p-1 gap-1 w-full overflow-x-auto rounded-xl bg-slate-100/80 border border-slate-200/60 backdrop-blur-sm scrollbar-none"
      >
        {menuItems.map((item) => {
          const isActive = configSection === item.key;
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              onClick={() => setConfigSection(item.key)}
              className={`
                group relative flex items-center justify-center gap-2 flex-1 px-4 py-2 text-xs font-semibold tracking-wide rounded-lg whitespace-nowrap
                transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900
                ${
                  isActive
                    ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-slate-900/5 font-semibold"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                }
              `}
            >
              <Icon 
                className={`w-4 h-4 transition-colors duration-200 ${
                  isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                }`} 
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Área de contenido */}
      <div className="flex-1 w-full min-w-0 transition-opacity duration-300 ease-in-out">
        <div key={configSection} className="animate-fade-in-up">
          {configSection === "plantillas" && <RenderConfigPlantillas />}
          {configSection === "sello" && <RenderConfigSello />}
          {configSection === "parametros" && <RenderConfigParametros />}
        </div>
      </div>
    </div>
  );
}
//////////////////////77configuracion 
//////////////////// configuracio plantillas

import TemplatesMappingPage from "./componentes/template";
export function RenderConfigPlantillas() {
  return <TemplatesMappingPage/>
}
///configuracion plantilass
import SelloManagementDashboard from "./componentes/sello_config_global";
function RenderConfigSello() {
  return ( <SelloManagementDashboard/>
   
  );
}

function RenderConfigParametros() {
  const parametros = useDbTable("parametros_sistema");
  const parametrosPorClave = useMemo(() => {
    const mapa = new Map<string, ParametroSistemaModel>();
    parametros?.forEach((parametro) => mapa.set(parametro.clave, parametro));
    return mapa;
  }, [parametros]);

  const valorScript = (clave: string, porDefecto: string) =>
    parametrosPorClave.get(clave)?.codigoScript ?? porDefecto;

  const secciones = [
    {
      title: "Alertas y notificaciones",
      items: [
        { label: "Días para alerta de retraso de OT", type: "number", val: valorScript("DIAS_ALERTA_RETRASO_OT", "0") },
        { label: "Días para alerta de vencimiento de plantilla", type: "number", val: valorScript("DIAS_ALERTA_VENCIMIENTO_PLANTILLA", "0") },
        { label: "Remitente de correos institucionales", type: "email", val: valorScript("REMITENTE_CORREOS_INSTITUCIONALES", "") },
      ],
    },
    {
      title: "Respaldo de datos",
      items: [
        { label: "Frecuencia de respaldo automático", type: "select", val: parametrosPorClave.get("FRECUENCIA_RESPALDO")?.frecuencia ?? "UNA_VEZ" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {secciones.map((section) => (
        <div key={section.title} className="rounded-xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", border: "1px solid #F1F5F9" }}>
          <div style={{ color: "#1F2A44", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{section.title}</div>
          <div className="flex flex-col gap-4">
            {section.items.map((item) => (
              <div key={item.label}>
                <label style={{ color: "#374151", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 5 }}>{item.label}</label>
                {item.type === "select" ? (
                  <select defaultValue={item.val} className="px-3 py-2.5 rounded-lg" style={{ border: "1px solid #CBD2E1", fontSize: 13, outline: "none", background: "#FFFFFF" }}>
                    {OPCIONES_FRECUENCIA.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={item.type} defaultValue={item.val} className="px-3 py-2.5 rounded-lg" style={{ border: "1px solid #CBD2E1", fontSize: 13, outline: "none", minWidth: 240 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button className="px-6 py-3 rounded-xl" style={{ background: "#5680F9", color: "#FFFFFF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
          Guardar parámetros
        </button>
      </div>
    </div>
  );
}


// ==========================================
// 4. COMPONENTE PRINCIPAL
// ==========================================

import { module_permission } from "@/app/server_component/controlle_permission";
import { useSession } from "next-auth/react";
import { generarTokenBackend } from "@/app/lib/auth-token";
// 🔄 Reemplazar useDbRealtime por los nuevos hooks
import { UsuarioModel, useDbTable, useDbActions } from "@/app/componets/tables_recharge";

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export function Administracion() {
  // Estado local
  const [auditoria, setAuditoria] = useState<init_bitacora[]>([]);
  const [tab, setTab] = useState<AdminTab>("usuarios");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<boolean>(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormUsuario>({ nombre: "", correo: "" });
  const [configSection, setConfigSection] = useState<ConfigSection>("plantillas");
  const [tokenPromise, setTokenPromise] = useState("");

  const { data: session } = useSession();

  // Store Subscriptions
  const usuarios = useDbTable("usuarios");
  const roles = useDbTable("roles");
  const { loadAllData, loadTable } = useDbActions();

  const permisos = session?.user?.permissions;
  const permission = useMemo(() => module_permission(permisos), [permisos]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // 1. Carga inicial de datos del Store
  useEffect(() => {
    loadAllData();
    loadTable("parametros_sistema");
    loadTable("sellos");
  }, [loadAllData, loadTable]);

  // 2. Permisos memorizados para evitar re-calculo y loops en useEffect
  const tab_permission = useMemo(() => {
    return {
      usuarios: !!permission?.administracion?.gestionar_usuarios_roles,
      bitacora: !!permission?.administracion?.consultar_bitacora_auditoria,
      config:
        !!permission?.administracion?.configurar_catalogo_parametros ||
        !!permission?.administracion?.configurar_plantillas_documentos,
    };
  }, [permission]);

  // 3. Creación de Token de Sesión
  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    generarTokenBackend({
      sub: session?.user?.id_user ?? "",
      email: session?.user?.email ?? "",
      user: {
        id: session?.user?.id_user ?? "",
        email: session?.user?.email ?? "",
        permissions: { permisos: { administracion: { consultar_bitacora_auditoria: true } } },
      },
    }).then((t) => {
      if (isMounted && t) setTokenPromise(t);
    });

    return () => { isMounted = false; };
  }, [session]);

  // 4. Carga de Bitácora memorizada sin loops
  const cargarBitacoraRealtime = useCallback(async () => {
    if (!tab_permission.bitacora) return;
    try {
      const resultado = (await obtenerBitacoraPorPermiso()) || [];
      if (resultado?.success && resultado.data) {
        const bitacorasFormateadas: init_bitacora[] = resultado.data.map((u) => ({
          fecha: u.fecha
            ? new Date(u.fecha)
                .toLocaleString("es-ES", {
                  day: "2-digit", month: "2-digit", year: "2-digit",
                  hour: "2-digit", minute: "2-digit", hour12: true,
                })
                .replace(",", "")
            : "Sin fecha",
          usuario: u.usuario,
          rol: u.rol,
          accion: u.accion,
          ip: u.ip,
          modulo: u.modulo,
        }));
        setAuditoria(bitacorasFormateadas);
      }
    } catch (error) {
      console.error("Error al cargar bitácora:", error);
    }
  }, [tab_permission.bitacora]);


  // 5. Indexación de Roles O(1) + Asignación de Nombres O(N)
  const rolesMap = useMemo(() => {
    const map = new Map<number, string>();
    roles?.forEach((r) => map.set(Number(r.idRol), r.nombreRol));
    return map;
  }, [roles]);

  const rolColors = useMemo<RolColorMap>(() => {
    const mapa: RolColorMap = {};
    roles?.forEach((rol, index) => {
      mapa[rol.nombreRol] = PALETA_ROLES[index % PALETA_ROLES.length];
    });
    return mapa;
  }, [roles]);

  const usuario_final = useMemo(() => {
    if (!usuarios?.length) return [];
    return usuarios.map((u): UsuarioModel & uso_rol => ({
      ...u,
      rolnombre: rolesMap.get(Number(u.idRol)) ?? "Sin Rol Asignado",
    }));
  }, [usuarios, rolesMap]);

  // 6. Buscador Memorizado (Evita ejecuciones innecesarias)
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return usuario_final;
    const term = search.toLowerCase();
    return usuario_final.filter(
      (u) =>
        u.nombreCompleto?.toLowerCase().includes(term) ||
        u.correo?.toLowerCase().includes(term) ||
        u.rolnombre?.toLowerCase().includes(term)
    );
  }, [usuario_final, search]);

  // Handlers CRUD
  const openCreate = () => {
    setForm({ nombre: "", correo: "" });
    setEditingUser(false);
    setShowModal(true);
  };

  const openEdit = (u: UsuarioModel & uso_rol) => {
    setForm({
      nombre: u.nombreCompleto,
      correo: u.correo,
      rol: u.rolnombre,
      estado: u.estado,
      id: u.idUsuario,
    });
    setEditingUser(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !form.correo) return;

    // Búsqueda dinámica del idRol desde el Map/Array en lugar de Hardcoding
    const rolEncontrado = roles?.find((r) => r.nombreRol === form.rol);
    const id_rol = rolEncontrado ? Number(rolEncontrado.idRol) : (roles?.[0]?.idRol ?? 0);

    if (editingUser) {
      if (form.id === undefined) {
        showToast("⚠️ Error: No se encontró el ID del usuario a editar.");
        return;
      }
      const respuesta = await actualizarUsuarioGenerico(form.id, {
        nombreCompleto: form.nombre,
        correo: form.correo,
        idRol: id_rol,
        estado: form.estado,
      });
      if (respuesta.success) {
        showToast("✅ Usuario actualizado exitosamente.");
        setShowModal(false);
      } else {
        showToast(`❌ Error: ${respuesta.error}`);
      }
    } else {
      const dup = usuarios?.find((u) => u.correo === form.correo);
      if (dup) {
        showToast("⚠️ Ya existe un usuario con ese correo institucional.");
        return;
      }
      await crearUsuarioGenerico({
        nombre: form.nombre,
        correo: form.correo,
        idRol: id_rol,
        estado: form.estado,
      });
      showToast("✅ Usuario creado exitosamente.");
      setShowModal(false);
    }
  };

  const toggleEstado = async (id: number, estado: boolean) => {
    await actualizarUsuarioGenerico(id, { estado: !estado });
  };
console.log("LONGITUD STORE:", usuarios.length);
console.log("LONGITUD FILTRADOS:", filteredUsers.length);
  return (
    <div className="module-page relative">
      {toast && <RenderToast message={toast} />}
      
      {showModal && (
        <RenderModalUsuario
          editingUser={editingUser}
          form={form}
          setForm={setForm}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          rolColors={rolColors}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Shield size={18} color="#5680F9" />
        <h1 className="text-xl font-semibold text-slate-800">Administración del Sistema</h1>
        <span className="px-2.5 py-0.5 rounded-full ml-1 bg-red-50 text-red-600 text-[11px] font-semibold">
          EXCLUSIVO DIRECTOR
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-5">Gestión de usuarios, auditoría y configuración del sistema.</p>

      {/* Tabs */}
      <div className="flex mb-5 border-b border-slate-200">
        {(["usuarios", "bitacora", "config"] as AdminTab[]).map(
          (t) =>
            tab_permission[t] && (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-3 text-xs transition-colors bg-transparent cursor-pointer ${
                  tab === t
                    ? "text-indigo-600 border-b-2 border-indigo-600 font-medium"
                    : "text-slate-500 font-normal hover:text-slate-700"
                }`}
              >
                {t === "usuarios"
                  ? "Gestión de usuarios"
                  : t === "bitacora"
                  ? "Bitácora de auditoría"
                  : "Configuración del sistema"}
              </button>
            )
        )}
      </div>

      {/* Vistas */}
      {tab === "usuarios" && (
        <RenderTabUsuarios
          search={search}
          setSearch={setSearch}
          filteredUsers={filteredUsers}
          openCreate={openCreate}
          openEdit={openEdit}
          toggleEstado={toggleEstado}
          showToast={showToast}
          rolColors={rolColors}
        />
      )}

      {tab === "bitacora" && (
        <RenderTabBitacora
          info_bitacora={auditoria}
          recarga={cargarBitacoraRealtime}
          token={tokenPromise}
        />
      )}

      {tab === "config" && (
        <RenderTabConfiguracion
          configSection={configSection}
          setConfigSection={setConfigSection}
        />
      )}
    </div>
  );
}
