// Ejecutor de migraciones.
//
// Aplica, en orden, los ficheros .sql de la carpeta /migraciones que todavía
// no se hayan aplicado, y anota cada uno en la tabla `migraciones_aplicadas`.
// Es seguro ejecutarlo en cada arranque: lo ya aplicado se salta.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA_POR_DEFECTO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migraciones',
);

// Número fijo que identifica "estoy migrando". Con el bloqueo, si dos
// instancias arrancan a la vez, la segunda espera a que termine la primera.
const BLOQUEO_MIGRACIONES = 727001;

/**
 * Aplica las migraciones pendientes.
 *
 * @param {import('pg').Pool} pool
 * @param {{ carpeta?: string }} [opciones]
 * @returns {Promise<string[]>} nombres de las migraciones aplicadas ahora
 */
export async function aplicarMigraciones(pool, { carpeta = CARPETA_POR_DEFECTO } = {}) {
  const ficheros = (await readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort();
  const aplicadasAhora = [];

  // Una sola conexión durante todo el proceso, para mantener el bloqueo.
  const conexion = await pool.connect();
  try {
    await conexion.query('SELECT pg_advisory_lock($1)', [BLOQUEO_MIGRACIONES]);

    await conexion.query(`
      CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
        nombre      TEXT PRIMARY KEY,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await conexion.query('SELECT nombre FROM migraciones_aplicadas');
    const yaAplicadas = new Set(rows.map((fila) => fila.nombre));

    for (const fichero of ficheros) {
      if (yaAplicadas.has(fichero)) continue;

      const sql = await readFile(path.join(carpeta, fichero), 'utf8');
      // Cada migración va en una transacción: o se aplica entera o no se aplica nada.
      try {
        await conexion.query('BEGIN');
        await conexion.query(sql);
        await conexion.query('INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)', [fichero]);
        await conexion.query('COMMIT');
      } catch (error) {
        await conexion.query('ROLLBACK');
        throw new Error(`Falló la migración ${fichero}: ${error.message}`);
      }
      aplicadasAhora.push(fichero);
    }
  } finally {
    await conexion.query('SELECT pg_advisory_unlock($1)', [BLOQUEO_MIGRACIONES]).catch(() => {});
    conexion.release();
  }

  return aplicadasAhora;
}
