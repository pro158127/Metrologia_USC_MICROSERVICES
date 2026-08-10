"use client";

import { useState, useEffect, Suspense } from "react";
import { Eye, EyeOff, Ruler, Lock, Mail, Shield } from "lucide-react";
import REsetPassword from "./componente/sign_up";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

interface LoginProps {
  onLogin?: () => void;
}

// 1. Extraemos la lógica que lee la URL
function LoginContent({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"login" | "reset">("login");

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorType = searchParams.get("code");
    if (!errorType) return;

    const errorMessages: Record<string, string> = {
      user_blocked_or_inactive: "Tu cuenta está inactiva o ha sido bloqueada. Contacta al administrador.",
      user_blocked_now: "Has superado el límite de intentos. Tu cuenta ha sido bloqueada.",
      invalid_credentials: "Contraseña incorrecta. Inténtalo de nuevo.",
      user_not_found: "El correo ingresado no está registrado.",
    };

    setError(errorMessages[errorType] || "Credenciales inválidas o error en el servidor.");
    setAttempts((prev) => prev + 1);
    setIsLoading(false);
  }, [searchParams]);

  const handleLogin = async () => {
    setIsLoading(true); // Fix: Iniciar estado de carga
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      // Fix: Validar la respuesta de NextAuth
      if (result?.error) {
        setError("Credenciales inválidas o cuenta no autorizada.");
        setIsLoading(false);
        return;
      }

      if (result?.ok) {
        router.push("/dashboard");
      }
    } catch (err) {
      console.error("Error crítico de red o servidor:", err);
      setError("Ocurrió un error inesperado. Por favor, inténtalo de nuevo.");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_18%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.16),_transparent_20%)] pointer-events-none" />

      <div
        className="hidden xl:flex flex-1 flex-col items-center justify-center overflow-hidden px-16 py-12"
        style={{ background: "linear-gradient(160deg, #0f172a 0%, #111827 46%, #1e293b 100%)" }}
      >
        <div className="relative z-10 max-w-md text-center">
          <div className="relative mx-auto mb-8 inline-flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/12 bg-white/5 backdrop-blur-xl">
            <Ruler size={36} color="#A5B4FC" />
          </div>
          <div className="mb-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white">MetroSoft</h1>
            <p className="mt-2 text-sm uppercase tracking-[0.35em] text-slate-300">USC</p>
          </div>
          <p className="mx-auto max-w-xs text-sm leading-7 text-slate-300">
            Plataforma de control y trazabilidad para el Laboratorio de Metrología.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-md rounded-[32px] border border-white/15 bg-white/95 p-8 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="mb-8">
            <div className="text-3xl font-semibold text-slate-950">Iniciar sesión</div>
            <p className="mt-2 text-sm text-slate-500">Accede con tu correo institucional USC</p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Correo institucional</label>
              <div className="relative">
                <Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@usc.edu.co"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 pl-11 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 pl-11 pr-12 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-900"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoading}
            className="mt-8 flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "Verificando..." : "Ingresar"}
          </button>

          <p className="mt-4 text-center text-sm text-slate-500">
            {email === "director@usc.edu.co" ? (
              <button
                type="button"
                onClick={() => setView("reset")}
                className="text-sky-600 hover:text-sky-800 transition underline focus:outline-none"
              >
                restablecer contraseña
              </button>
            ) : (
              "Si olvidaste tu contraseña, contacta al administrador."
            )}
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-sky-100/90 bg-sky-50/80 px-4 py-3 text-xs text-slate-600">
            <Shield size={14} className="text-sky-600" />
            Sesión expira tras 30 min de inactividad · HTTPS cifrado
          </div>
        </div>
      </div>

      {view === "reset" && <REsetPassword onBack={() => setView("login")} emailPredefined={email} />}
    </div>
  );
}

// 2. Exportación envuelta en Suspense para evitar fallos de HMR/Build
export default function Login(props: LoginProps) {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">Cargando...</div>}>
      <LoginContent {...props} />
    </Suspense>
  );
}