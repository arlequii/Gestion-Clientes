// Repositorio de sesiones. Guarda el HASH del token, nunca el token.

import { generarToken, hashDeToken } from '../seguridad/tokens.js';

export function crearRepositorioSesiones(db) {
  return {
    /** Crea una sesión y devuelve el token (única vez que existe en claro) y su caducidad. */
    async crear({ usuarioId, tipo, horas }) {
      const token = generarToken();
      const { rows } = await db.query(
        `INSERT INTO sesiones (token_hash, usuario_id, tipo, expira_en)
         VALUES ($1, $2, $3, now() + make_interval(hours => $4)) RETURNING expira_en`,
        [hashDeToken(token), usuarioId, tipo, horas]);
      return { token, expiraEn: rows[0].expira_en };
    },

    /** Usuario dueño de un token válido (existe, no ha caducado y el usuario sigue activo), o null. */
    async buscarUsuario(token, tipo) {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.nombre, u.rol
           FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = $1 AND s.tipo = $2 AND s.expira_en > now() AND u.activo`,
        [hashDeToken(token), tipo]);
      return rows[0] ?? null;
    },

    async eliminar(token) {
      await db.query('DELETE FROM sesiones WHERE token_hash = $1', [hashDeToken(token)]);
    },

    async eliminarCaducadas() {
      await db.query('DELETE FROM sesiones WHERE expira_en <= now()');
    },
  };
}
