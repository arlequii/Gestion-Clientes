// Ejecuta varias operaciones como una sola: o se guardan todas o ninguna.

/**
 * @template T
 * @param {import('pg').Pool} pool
 * @param {(db: import('pg').PoolClient) => Promise<T>} trabajo recibe una conexión dedicada
 * @returns {Promise<T>} lo que devuelva `trabajo`
 */
export async function conTransaccion(pool, trabajo) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const resultado = await trabajo(db);
    await db.query('COMMIT');
    return resultado;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
