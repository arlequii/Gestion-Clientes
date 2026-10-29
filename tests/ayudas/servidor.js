// Arranca una aplicación Express en un puerto libre para probarla por HTTP real.
import { once } from 'node:events';

export async function iniciarServidor(app) {
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    async cerrar() {
      servidor.closeAllConnections();
      await new Promise((resolver) => servidor.close(resolver));
    },
  };
}
