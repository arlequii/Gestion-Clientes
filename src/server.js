// Punto de entrada: lee la configuración, prepara la base de datos y arranca el servidor web.

import { leerConfiguracion } from './config/index.js';
import { crearPool } from './db/pool.js';
import { aplicarMigraciones } from './db/migraciones.js';
import { importarSiNuncaSeImporto } from './importacion/importador.js';
import { crearServicios } from './servicios/index.js';
import { asegurarAdministrador } from './servicios/administrador.js';
import { crearApp } from './app.js';
import { registrar } from './registro.js';

let config;
try {
  config = leerConfiguracion();
} catch (error) {
  console.error(error.message); // todos los problemas de configuración juntos, en varias líneas
  process.exit(1);
}

const pool = crearPool(config);

// Antes de aceptar peticiones, la base de datos debe tener el esquema al día.
try {
  const aplicadas = await aplicarMigraciones(pool);
  if (aplicadas.length) registrar('info', 'Migraciones aplicadas', { migraciones: aplicadas });
} catch (error) {
  registrar('error', 'No se pudo preparar la base de datos', { error: error.message });
  process.exit(1);
}

// Primer arranque: crea el administrador si todavía no hay ningún usuario.
const servicios = crearServicios(pool);
try {
  const admin = await asegurarAdministrador(servicios.repositorios, config.admin);
  if (admin.creado && admin.claveGenerada) {
    // Se muestra una sola vez; no se guarda en ningún sitio.
    registrar('aviso', 'Administrador creado con contraseña generada. Anótala ahora: no volverá a mostrarse', {
      email: admin.email, clave: admin.claveGenerada,
    });
  } else if (admin.creado) {
    registrar('info', 'Administrador creado', { email: admin.email });
  }
} catch (error) {
  registrar('error', 'No se pudo crear el administrador inicial', { error: error.message });
  process.exit(1);
}

// Primer arranque: carga los datos del Excel antiguo. Si falla, la aplicación
// arranca igualmente (vacía) y se puede repetir con `npm run importar`.
if (config.importarAlArrancar) {
  try {
    const informe = await importarSiNuncaSeImporto(pool, 'datos/clientes_antiguos.csv');
    if (informe) registrar('info', 'Importación inicial completada', { ...informe.resumen, cuadre: informe.cuadre });
  } catch (error) {
    registrar('error', 'No se pudo importar el CSV inicial', { error: error.message });
  }
}

const app = crearApp({ pool, servicios, config });

const servidor = app.listen(config.puerto, () => {
  registrar('info', 'Aplicación en marcha', { puerto: config.puerto, entorno: config.entorno });
});

// Apagado ordenado: Docker envía SIGTERM al parar el contenedor. Se deja de
// aceptar peticiones, se cierran las conexiones y se sale. Si algo se queda
// colgado, se fuerza la salida a los 10 segundos.
function apagar(senal) {
  registrar('info', 'Cerrando la aplicación', { senal });
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
