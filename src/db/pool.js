// Conexión a PostgreSQL.
//
// Pool de conexiones reutilizadas entre peticiones.

import pg from 'pg';
import { registrar } from '../registro.js';

// PostgreSQL devuelve los BIGINT (los ids) como texto para no perder precisión.
// Nuestros ids nunca se acercan al límite de JavaScript (9 · 10^15), así que se
// convierten a número y la API devuelve "id": 1 en lugar de "id": "1".
// Los importes (NUMERIC) se dejan como texto a propósito: con dinero no se usan decimales binarios.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
// Las fechas (DATE) se dejan como texto "2025-01-14": evita desfases por zona horaria.
pg.types.setTypeParser(pg.types.builtins.DATE, (valor) => valor);

/**
 * Crea el pool de conexiones a partir de la configuración.
 * Las conexiones se abren solo cuando se necesitan, así que crear el pool
 * no falla aunque la base de datos todavía no esté disponible.
 */
export function crearPool(config) {
  const pool = new pg.Pool({
    host: config.baseDatos.host,
    port: config.baseDatos.puerto,
    database: config.baseDatos.nombre,
    user: config.baseDatos.usuario,
    password: config.baseDatos.clave,
    max: 10, // conexiones simultáneas como máximo
    connectionTimeoutMillis: 5000, // si no conecta en 5 s, falla en vez de esperar sin fin
  });

  // Un error en una conexión inactiva no debe tumbar toda la aplicación.
  pool.on('error', (error) => {
    registrar('error', 'Error en una conexión inactiva de la base de datos', { error: error.message });
  });

  return pool;
}
