// Tests del servicio de autenticación y del administrador inicial, con PostgreSQL real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';
import { crearServicios } from '../src/servicios/index.js';
import { asegurarAdministrador } from '../src/servicios/administrador.js';
import { verificarClave } from '../src/seguridad/claves.js';

let bd = null;
let servicios;
before(async () => {
  bd = await crearBaseDatosPrueba();
  if (bd) servicios = crearServicios(bd.pool);
});
after(async () => { await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

const login = (clave, email = 'admin@ejemplo.es', origen = '1.1.1.1') =>
  servicios.autenticacion.iniciarSesion({ email, clave, tipo: 'api', origen });

prueba('administrador: se crea con la contraseña indicada, guardada solo como hash', async () => {
  const r = await asegurarAdministrador(servicios.repositorios, { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  assert.deepEqual(r, { creado: true, email: 'admin@ejemplo.es', claveGenerada: undefined });
  const u = await servicios.repositorios.usuarios.buscarPorEmail('ADMIN@ejemplo.es'); // sin distinguir mayúsculas
  assert.notEqual(u.clave_hash, 'clave-larga-123');
  assert.equal(await verificarClave('clave-larga-123', u.clave_hash), true);
});

prueba('administrador: si ya hay usuarios no se crea otro ni se cambia la clave', async () => {
  const r = await asegurarAdministrador(servicios.repositorios, { email: 'otro@ejemplo.es', clave: 'otra-clave-larga' });
  assert.deepEqual(r, { creado: false });
  assert.equal(await servicios.repositorios.usuarios.contar(), 1);
});

prueba('administrador: sin contraseña en la configuración se genera una aleatoria', async () => {
  const otra = await crearBaseDatosPrueba();
  try {
    const { repositorios } = crearServicios(otra.pool);
    const r = await asegurarAdministrador(repositorios, { email: 'a@b.es' });
    assert.ok(r.claveGenerada.length >= 16);
    const u = await repositorios.usuarios.buscarPorEmail('a@b.es');
    assert.equal(await verificarClave(r.claveGenerada, u.clave_hash), true);
  } finally {
    await otra.destruir();
  }
});

prueba('login: con credenciales correctas devuelve un token que identifica al usuario', async () => {
  const sesion = await login('clave-larga-123');
  assert.equal(sesion.usuario.email, 'admin@ejemplo.es');
  assert.equal((await servicios.autenticacion.autenticar(sesion.token, 'api')).email, 'admin@ejemplo.es');
});

prueba('login: el token no se guarda en claro y no vale como sesión web', async () => {
  const { token } = await login('clave-larga-123');
  const { rows } = await bd.pool.query('SELECT token_hash FROM sesiones');
  assert.ok(rows.every((r) => r.token_hash !== token));
  assert.equal(await servicios.autenticacion.autenticar(token, 'web'), null);
});

prueba('login: clave incorrecta y email desconocido dan el mismo error 401', async () => {
  await assert.rejects(login('mala'), (e) => e.estado === 401 && /incorrectos/.test(e.message));
  await assert.rejects(login('mala', 'nadie@ejemplo.es'), (e) => e.estado === 401 && /incorrectos/.test(e.message));
});

prueba('login: un usuario desactivado no puede entrar y sus tokens dejan de valer', async () => {
  const { token } = await login('clave-larga-123');
  await bd.pool.query(`UPDATE usuarios SET activo = false`);
  assert.equal(await servicios.autenticacion.autenticar(token, 'api'), null);
  await assert.rejects(login('clave-larga-123', 'admin@ejemplo.es', '9.9.9.9'), (e) => e.estado === 401);
  await bd.pool.query(`UPDATE usuarios SET activo = true`);
});

prueba('sesión: un token caducado no vale', async () => {
  const { token } = await login('clave-larga-123');
  await bd.pool.query(`UPDATE sesiones SET expira_en = now() - interval '1 minute'`);
  assert.equal(await servicios.autenticacion.autenticar(token, 'api'), null);
});

prueba('sesión: cerrar sesión invalida el token', async () => {
  const { token } = await login('clave-larga-123');
  await servicios.autenticacion.cerrarSesion(token);
  assert.equal(await servicios.autenticacion.autenticar(token, 'api'), null);
});

prueba('login: tras 5 fallos se bloquea, incluso con la contraseña correcta', async () => {
  for (let i = 0; i < 5; i++) await assert.rejects(login('mala', 'admin@ejemplo.es', '2.2.2.2'), (e) => e.estado === 401);
  await assert.rejects(login('clave-larga-123', 'admin@ejemplo.es', '2.2.2.2'), (e) => e.estado === 429);
  // Otro origen no se ve afectado.
  assert.ok((await login('clave-larga-123', 'admin@ejemplo.es', '3.3.3.3')).token);
});
