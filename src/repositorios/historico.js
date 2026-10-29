// Repositorio del histórico de cambios.

export function crearRepositorioHistorico(db) {
  return {
    /**
     * Anota uno o varios cambios (una fila por campo modificado).
     * @param {{ clienteId: number, entidad: 'cliente'|'contacto', entidadId: number,
     *           accion: string, registro: string, usuario: {id: number, email: string} }} contexto
     * @param {{ campo?: string|null, anterior?: string|null, nuevo?: string|null }[]} cambios
     */
    async registrar({ clienteId, entidad, entidadId, accion, registro, usuario }, cambios) {
      for (const c of cambios) {
        await db.query(
          `INSERT INTO historico_cambios
             (cliente_id, entidad, entidad_id, accion, registro, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [clienteId, entidad, entidadId, accion, registro, c.campo ?? null, c.anterior ?? null, c.nuevo ?? null,
            usuario.id, usuario.email]);
      }
    },

    /** Más recientes primero. */
    async listar(clienteId, { pagina, porPagina }) {
      const { rows: [{ total }] } = await db.query(
        'SELECT count(*)::int AS total FROM historico_cambios WHERE cliente_id = $1', [clienteId]);
      const { rows } = await db.query(
        `SELECT id, entidad, entidad_id, accion, registro, campo, valor_anterior, valor_nuevo, usuario_email, creado_en
           FROM historico_cambios WHERE cliente_id = $1
          ORDER BY creado_en DESC, id DESC LIMIT $2 OFFSET $3`, [clienteId, porPagina, (pagina - 1) * porPagina]);
      return {
        total,
        cambios: rows.map((f) => ({
          id: f.id, entidad: f.entidad, entidadId: f.entidad_id, accion: f.accion, registro: f.registro, campo: f.campo,
          valorAnterior: f.valor_anterior, valorNuevo: f.valor_nuevo, usuario: f.usuario_email, fecha: f.creado_en,
        })),
      };
    },
  };
}
