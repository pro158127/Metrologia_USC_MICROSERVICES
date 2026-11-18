import { io } from "socket.io-client";

// OMITIMOS la URL. Al no pasar una URL, Socket.io asume automáticamente 
// el dominio actual (tu DevTunnel en el puerto 3000 o localhost:3000).
const socket = io({
  path: "/socket.io",
  autoConnect: true
});

export default socket;