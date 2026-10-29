// Repositorio de usuarios: el único sitio con SQL sobre la tabla `usuarios`.

/**
 * @param {{ query: Function }} db un pool o una conexión de transacción
 */
export function crearRepositorioUsuarios(db) {
  return {
    async buscarPorEmail(email) {
      const { rows } = await db.query('SELECT * FROM usuarios WHERE lower(email) = lower($1)', [email]);
      return rows[0] ?? null;
    },

    async contar() {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM usuarios');
      return rows[0].n;
    },

    async crear({ email, nombre, claveHash, rol = 'admin' }) {
      const { rows } = await db.query(
        `INSERT INTO usuarios (email, nombre, clave_hash, rol) VALUES ($1, $2, $3, $4)
         RETURNING id, email, nombre, rol`, [email, nombre, claveHash, rol]);
      return rows[0];
    },
  };
}
