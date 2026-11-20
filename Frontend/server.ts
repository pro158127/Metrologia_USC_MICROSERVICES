import { createServer } from 'node:http';
import next from 'next';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const port = Number(process.env.PORT) || 3000;
  // PostgreSQL LISTEN y Socket.IO pertenecen al backend.
  createServer((req, res) => { void handle(req, res); }).listen(port, '0.0.0.0', () => {
    console.log(`Frontend disponible en el puerto ${port}`);
  });
});
