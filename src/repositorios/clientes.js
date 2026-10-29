// Repositorio de clientes: todo el SQL sobre `clientes` está aquí.

// Suma de bases imponibles (sin IVA) de las facturas del cliente. Se calcula
// en cada consulta: nunca puede quedar desactualizada (ver docs/decisiones.md).
const FACTURACION = `(SELECT COALESCE(SUM(f.base_imponible), 0)::numeric(14,2)
                        FROM facturas f WHERE f.cliente_id = c.id)`;

const SELECCION = `
  c.id, c.empresa, c.cif, c.direccion, c.cp, c.ciudad, c.pais, c.estado, c.fecha_alta,
  c.creado_en, c.modificado_en, c.eliminado_en, c.comercial_id, m.nombre AS comercial_nombre,
  ${FACTURACION} AS facturacion_acumulada`;

const DESDE = `FROM clientes c LEFT JOIN comerciales m ON m.id = c.comercial_id`;

/** Fila de la base de datos → objeto de la API. */
function aCliente(fila) {
  return {
    id: fila.id, empresa: fila.empresa, cif: fila.cif, direccion: fila.direccion, cp: fila.cp,
    ciudad: fila.ciudad, pais: fila.pais, estado: fila.estado, fechaAlta: fila.fecha_alta,
    comercial: fila.comercial_id ? { id: fila.comercial_id, nombre: fila.comercial_nombre } : null,
    facturacionAcumulada: fila.facturacion_acumulada,
    creadoEn: fila.creado_en, modificadoEn: fila.modificado_en, eliminadoEn: fila.eliminado_en,
  };
}

// Orden permitido → expresión SQL. Solo estos textos llegan al SQL, nunca lo que escribe el usuario.
const ORDENES = {
  empresa: 'c.empresa', ciudad: 'c.ciudad', pais: 'c.pais', estado: 'c.estado',
  fechaAlta: 'c.fecha_alta', modificadoEn: 'c.modificado_en', facturacion: 'facturacion_acumulada',
};

// Columna de la base de datos de cada campo editable.
const COLUMNAS = {
  empresa: 'empresa', cif: 'cif', direccion: 'direccion', cp: 'cp', ciudad: 'ciudad',
  pais: 'pais', estado: 'estado', fechaAlta: 'fecha_alta', comercialId: 'comercial_id',
};

/** Escapa % y _ para que se busquen como texto normal y no como comodines. */
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&');

export function crearRepositorioClientes(db) {
  return {
    /**
     * Listado paginado con búsqueda y filtros.
     * @returns {Promise<{ clientes: object[], total: number }>}
     */
    async listar({ q, estado, pais, comercialId, eliminados, orden, direccion, pagina, porPagina }) {
      const condiciones = [eliminados ? 'c.eliminado_en IS NOT NULL' : 'c.eliminado_en IS NULL'];
      const parametros = [];
      const param = (valor) => { parametros.push(valor); return `$${parametros.length}`; };

      if (q) {
        // La búsqueda ignora tildes y mayúsculas; mira empresa, CIF y los contactos (nombre y email).
        const patron = param(`%${escaparLike(q)}%`);
        const cif = q.toUpperCase().replace(/[\s.\-]/g, '');
        const patronCif = param(`%${escaparLike(cif)}%`);
        condiciones.push(`(
          unaccent(c.empresa) ILIKE unaccent(${patron})
          OR c.cif LIKE ${patronCif}
          OR EXISTS (SELECT 1 FROM contactos k WHERE k.cliente_id = c.id
                      AND (unaccent(k.nombre) ILIKE unaccent(${patron}) OR k.email ILIKE ${patron})))`);
      }
      if (estado) condiciones.push(`c.estado = ${param(estado)}`);
      if (pais) condiciones.push(`c.pais = ${param(pais)}`);
      if (comercialId) condiciones.push(`c.comercial_id = ${param(comercialId)}`);
      const donde = `WHERE ${condiciones.join(' AND ')}`;

      const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total ${DESDE} ${donde}`, parametros);

      const sentido = direccion === 'desc' ? 'DESC' : 'ASC';
      const { rows } = await db.query(
        `SELECT ${SELECCION},
                p.nombre AS contacto_nombre, p.email AS contacto_email
           ${DESDE}
           LEFT JOIN LATERAL (SELECT nombre, email FROM contactos WHERE cliente_id = c.id ORDER BY id LIMIT 1) p ON true
           ${donde}
          ORDER BY ${ORDENES[orden]} ${sentido} NULLS LAST, c.id
          LIMIT ${param(porPagina)} OFFSET ${param((pagina - 1) * porPagina)}`, parametros);

      return {
        total,
        clientes: rows.map((fila) => ({
          ...aCliente(fila),
          contactoPrincipal: fila.contacto_nombre ? { nombre: fila.contacto_nombre, email: fila.contacto_email } : null,
        })),
      };
    },

    /** Cuántos clientes hay ahora mismo en la papelera (borrado lógico). */
    async contarEliminados() {
      const { rows: [{ total }] } = await db.query('SELECT count(*)::int AS total FROM clientes WHERE eliminado_en IS NOT NULL');
      return total;
    },

    /** Un cliente (también si está en la papelera), o null. `bloquear` impide que otra petición lo cambie a la vez. */
    async buscarPorId(id, { bloquear = false } = {}) {
      const { rows } = await db.query(
        `SELECT ${SELECCION} ${DESDE} WHERE c.id = $1 ${bloquear ? 'FOR UPDATE OF c' : ''}`, [id]);
      return rows[0] ? aCliente(rows[0]) : null;
    },

    async crear(d) {
      const { rows } = await db.query(
        `INSERT INTO clientes (empresa, cif, direccion, cp, ciudad, pais, comercial_id, estado, fecha_alta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'Activo'),COALESCE($9::date, CURRENT_DATE)) RETURNING id`,
        [d.empresa, d.cif, d.direccion ?? null, d.cp ?? null, d.ciudad ?? null, d.pais,
          d.comercialId ?? null, d.estado ?? null, d.fechaAlta ?? null]);
      return rows[0].id;
    },

    /** Actualiza solo los campos recibidos (nombres de la API, p. ej. `comercialId`). */
    async actualizar(id, cambios) {
      const campos = Object.keys(cambios).filter((c) => COLUMNAS[c]);
      if (campos.length === 0) return;
      const asignaciones = campos.map((c, i) => `${COLUMNAS[c]} = $${i + 1}`).join(', ');
      await db.query(`UPDATE clientes SET ${asignaciones} WHERE id = $${campos.length + 1}`,
        [...campos.map((c) => cambios[c]), id]);
    },

    /** Borrado lógico (eliminado=true) o restauración (false). */
    async marcarEliminado(id, eliminado) {
      await db.query(`UPDATE clientes SET eliminado_en = ${eliminado ? 'now()' : 'NULL'} WHERE id = $1`, [id]);
    },
  };
}
