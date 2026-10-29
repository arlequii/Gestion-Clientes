// Aplica las migraciones pendientes y termina.  Uso:  npm run migrar

import { leerConfiguracion } from '../src/config/index.js';
import { crearPool } from '../src/db/pool.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';

const pool = crearPool(leerConfiguracion());
try {
  const aplicadas = await aplicarMigraciones(pool);
  console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'Base de datos al día.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
