// Tests de las migraciones y de las reglas del esquema.
// Necesitan PostgreSQL (ver tests/ayudas/baseDatosPrueba.js); si no hay, se omiten.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';

let bd = null;
before(async () => { bd = await crearBaseDatosPrueba(); });
after(async () => { await bd?.destruir(); });

// Como `test`, pero se omite si no hay PostgreSQL. Se decide al ejecutar (no al
// declarar el test), porque la base se crea en `before`.
function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

// Crea un cliente mínimo y devuelve su id.
async function nuevoCliente(cif, extra = {}) {
  const { rows } = await bd.pool.query(
    `INSERT INTO clientes (empresa, cif, pais, estado) VALUES ($1, $2, 'España', $3) RETURNING id`,
    ['Empresa ' + cif, cif, extra.estado ?? 'Activo'],
  );
  return rows[0].id;
}

prueba('volver a aplicar las migraciones no hace nada', async () => {
  assert.deepEqual(await aplicarMigraciones(bd.pool), []);
  const { rows } = await bd.pool.query('SELECT count(*)::int AS n FROM migraciones_aplicadas');
  assert.equal(rows[0].n, 4); // 001, 002, 003 y 004
});

prueba('el total de la factura lo calcula la base de datos', async () => {
  const id = await nuevoCliente('B11111111');
  const { rows } = await bd.pool.query(
    `INSERT INTO facturas (cliente_id, numero, fecha_factura, base_imponible, iva_porcentaje)
     VALUES ($1, 'F-1', '2026-09-03', 1875.60, 21) RETURNING total`, [id]);
  assert.equal(rows[0].total, '2269.48'); // 1875,60 * 1,21 = 2269,476
  await assert.rejects(bd.pool.query('UPDATE facturas SET total = 1'), (e) => e.code === '428C9'); // columna generada: no se puede escribir
});

prueba('facturas: número único, abonos con base negativa e IVA entre 0 y 100', async () => {
  const id = await nuevoCliente('B22222222');
  const insertar = (numero, base, iva) => bd.pool.query(
    `INSERT INTO facturas (cliente_id, numero, fecha_factura, base_imponible, iva_porcentaje)
     VALUES ($1, $2, '2026-01-01', $3, $4)`, [id, numero, base, iva]);
  await insertar('F-2', 100, 21);
  await assert.rejects(insertar('F-2', 100, 21), (e) => e.code === '23505'); // número repetido
  await insertar('F-3', -100, 21); // un abono (base negativa) es válido
  await assert.rejects(insertar('F-4', 100, 150), (e) => e.code === '23514'); // IVA imposible
});

prueba('el CIF es único y el estado solo admite Activo o Inactivo', async () => {
  await nuevoCliente('B33333333');
  await assert.rejects(nuevoCliente('B33333333'), (e) => e.code === '23505');
  await assert.rejects(nuevoCliente('B44444444', { estado: 'Pendiente' }), (e) => e.code === '23514');
});

prueba('el email del contacto no se repite dentro de un cliente, aunque cambien las mayúsculas', async () => {
  const a = await nuevoCliente('B55555555');
  const b = await nuevoCliente('B66666666');
  const insertar = (cliente, email) => bd.pool.query(
    `INSERT INTO contactos (cliente_id, nombre, email) VALUES ($1, 'Ana', $2)`, [cliente, email]);
  await insertar(a, 'ana@ejemplo.es');
  await assert.rejects(insertar(a, 'ANA@ejemplo.es'), (e) => e.code === '23505');
  await insertar(b, 'ana@ejemplo.es'); // en otro cliente sí se permite
});

prueba('modificar un contacto actualiza la fecha de última modificación del cliente', async () => {
  const id = await nuevoCliente('B77777777');
  const leer = async () => (await bd.pool.query('SELECT modificado_en FROM clientes WHERE id=$1', [id])).rows[0].modificado_en;
  const antes = await leer();
  await new Promise((r) => setTimeout(r, 15));
  await bd.pool.query(`INSERT INTO contactos (cliente_id, nombre, email) VALUES ($1, 'Eva', 'eva@ejemplo.es')`, [id]);
  const trasContacto = await leer();
  assert.ok(trasContacto > antes, 'añadir un contacto debe actualizar la fecha');
  await new Promise((r) => setTimeout(r, 15));
  await bd.pool.query(`UPDATE clientes SET ciudad = 'Madrid' WHERE id = $1`, [id]);
  assert.ok((await leer()) > trasContacto, 'editar el cliente debe actualizar la fecha');
});

prueba('una migración que falla se deshace entera y no queda anotada', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const carpeta = await mkdtemp(path.join(tmpdir(), 'migr-'));
  await writeFile(path.join(carpeta, '001_mala.sql'), 'CREATE TABLE prueba_a (id int); SELECT sintaxis_invalida;');

  const otra = await crearBaseDatosPrueba({ migrar: false });
  try {
    await assert.rejects(aplicarMigraciones(otra.pool, { carpeta }), /Falló la migración 001_mala\.sql/);
    const { rows } = await otra.pool.query(`SELECT to_regclass('prueba_a') AS tabla`);
    assert.equal(rows[0].tabla, null); // la tabla creada antes del error no existe
  } finally {
    await otra.destruir();
  }
});

prueba('el histórico solo admite acciones y entidades conocidas', async () => {
  const id = await nuevoCliente('B88888888');
  const insertar = (accion) => bd.pool.query(
    `INSERT INTO historico_cambios (cliente_id, entidad, entidad_id, accion, usuario_email)
     VALUES ($1, 'cliente', $1, $2, 'admin@ejemplo.es')`, [id, accion]);
  await insertar('modificacion');
  await assert.rejects(insertar('inventada'), (e) => e.code === '23514');
});
