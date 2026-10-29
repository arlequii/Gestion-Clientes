// Importa un CSV a la base de datos y muestra el informe.
// Uso:  npm run importar -- [ruta/al/fichero.csv]   (por defecto datos/clientes_antiguos.csv)

import { leerConfiguracion } from '../src/config/index.js';
import { crearPool } from '../src/db/pool.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { importarFichero, informeATexto } from '../src/importacion/importador.js';

const ruta = process.argv[2] ?? 'datos/clientes_antiguos.csv';
const pool = crearPool(leerConfiguracion());
try {
  await aplicarMigraciones(pool);
  console.log(informeATexto(await importarFichero(pool, ruta)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
