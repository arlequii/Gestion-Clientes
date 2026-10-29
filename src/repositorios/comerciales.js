// Repositorio de comerciales.

export function crearRepositorioComerciales(db) {
  return {
    async listar() {
      const { rows } = await db.query('SELECT id, nombre FROM comerciales WHERE activo ORDER BY nombre');
      return rows;
    },
    async buscarPorId(id) {
      const { rows } = await db.query('SELECT id, nombre FROM comerciales WHERE id = $1 AND activo', [id]);
      return rows[0] ?? null;
    },
  };
}
