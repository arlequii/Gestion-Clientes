// Repositorio de contactos.

const aContacto = (f) => ({ id: f.id, nombre: f.nombre, email: f.email, telefono: f.telefono });

export function crearRepositorioContactos(db) {
  return {
    async listarPorCliente(clienteId) {
      const { rows } = await db.query(
        'SELECT id, nombre, email, telefono FROM contactos WHERE cliente_id = $1 ORDER BY id', [clienteId]);
      return rows.map(aContacto);
    },

    async buscar(clienteId, contactoId) {
      const { rows } = await db.query(
        'SELECT id, nombre, email, telefono FROM contactos WHERE cliente_id = $1 AND id = $2', [clienteId, contactoId]);
      return rows[0] ? aContacto(rows[0]) : null;
    },

    async contar(clienteId) {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM contactos WHERE cliente_id = $1', [clienteId]);
      return rows[0].n;
    },

    async crear(clienteId, { nombre, email, telefono }) {
      const { rows } = await db.query(
        `INSERT INTO contactos (cliente_id, nombre, email, telefono) VALUES ($1,$2,$3,$4)
         RETURNING id, nombre, email, telefono`, [clienteId, nombre, email, telefono ?? null]);
      return aContacto(rows[0]);
    },

    async actualizar(contactoId, cambios) {
      const campos = Object.keys(cambios).filter((c) => ['nombre', 'email', 'telefono'].includes(c));
      if (campos.length === 0) return;
      const asignaciones = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await db.query(`UPDATE contactos SET ${asignaciones} WHERE id = $${campos.length + 1}`,
        [...campos.map((c) => cambios[c]), contactoId]);
    },

    async eliminar(contactoId) {
      await db.query('DELETE FROM contactos WHERE id = $1', [contactoId]);
    },
  };
}
