// Ayuda para los tests que necesitan PostgreSQL de verdad.
//
// Crea una base de datos temporal con nombre único, con el esquema ya
// migrado, y la borra al terminar: los tests no tocan los datos reales.
// Usa las mismas variables DB_* que la aplicación (por defecto, las de
// desarrollo de docker-compose.yml). Si no hay PostgreSQL disponible
// devuelve null y los tests se omiten en lugar de fallar.

import pg from 'pg';
import { crearPool } from '../../src/db/pool.js';
import { aplicarMigraciones } from '../../src/db/migraciones.js';

function configuracion(nombreBd) {
  return {
    baseDatos: {
      host: process.env.DB_HOST ?? 'localhost',
      puerto: Number(process.env.DB_PORT ?? 5432),
      nombre: nombreBd,
      usuario: process.env.DB_USER ?? 'clientes',
      clave: process.env.DB_PASSWORD ?? 'clientes_dev',
    },
  };
}

/**
 * @param {{ migrar?: boolean }} [opciones] migrar=false deja la base vacía
 * @returns {Promise<null | { pool: import('pg').Pool, destruir: () => Promise<void> }>}
 */
export async function crearBaseDatosPrueba({ migrar = true } = {}) {
  const nombre = `clientes_test_${process.pid}_${Date.now()}`;
  const { host, puerto, usuario, clave } = configuracion('postgres').baseDatos;
  const admin = new pg.Client({ host, port: puerto, user: usuario, password: clave,
    database: 'postgres', connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
  } catch {
    return null; // no hay PostgreSQL accesible: los tests se omiten
  }
  // Si la conexión funciona, cualquier otro fallo debe verse, no ocultarse.
  await admin.query(`CREATE DATABASE ${nombre}`);

  const pool = crearPool(configuracion(nombre));
  if (migrar) await aplicarMigraciones(pool);

  return {
    pool,
    async destruir() {
      await pool.end();
      await admin.query(`DROP DATABASE ${nombre} WITH (FORCE)`);
      await admin.end();
    },
  };
}
