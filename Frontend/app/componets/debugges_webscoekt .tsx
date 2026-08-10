"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export default function SocketDebugger() {
  const [status, setStatus] = useState("Desconectado");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    console.log("🚀 [SocketDebugger] Componente cliente montado en el navegador.");

    // Cambia el puerto si tu Fastify corre en otro puerto (ej. 4000 o 3001)
    const socket = io("http://192.168.1.11:3001", {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      const msg = `✅ Conectado con ID: ${socket.id}`;
      console.log(msg);
      setStatus(msg);
    });

    socket.on("connect_error", (err) => {
      const msg = `❌ Error de conexión: ${err.message}`;
      console.error(msg);
      setStatus(msg);
    });

    socket.onAny((event, ...args) => {
      const msg = `📡 Evento recibido: [${event}] -> ${JSON.stringify(args)}`;
      console.warn(msg);
      setLogs((prev) => [msg, ...prev]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "fixed", bottom: 10, right: 10, background: "#000", color: "#0f0", padding: 15, zIndex: 99999, borderRadius: 8, fontFamily: "monospace", maxWidth: 400 }}>
      <h4>Debugger Socket.io</h4>
      <p>Estado: {status}</p>
      <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 11 }}>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}