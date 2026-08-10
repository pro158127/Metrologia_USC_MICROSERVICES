import { io } from "socket.io-client";

// Define la URL de tu servidor Node.js/Express donde configuraste el WebSocket
// Si tu servidor backend corre en un puerto diferente al de Next.js (ej. 3001), ponlo aquí.
// Si corre en el mismo dominio/puerto (ej. usando rutas API o proxy), puedes dejarlo como "/" o tu URL de producción.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
console.log(SOCKET_URL,"galfaflasdasd")
// Exportamos una única instancia de la conexión para usarla en cualquier componente
 const socket = io(SOCKET_URL, {
  autoConnect: true,
  // Si tu backend y frontend están en el mismo servidor, esto evita problemas de CORS
  transports: ["websocket", "polling"] 
});

export default socket
