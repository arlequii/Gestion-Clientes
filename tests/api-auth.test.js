// Tests de la API de acceso por HTTP real, con PostgreSQL real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';
import { iniciarServidor } from './ayudas/servidor.js';
import { crearApp } from '../src/app.js';
import { crearServicios } from '../src/servicios/index.js';
import { asegurarAdministrador } from '../src/servicios/administrador.js';

let bd = null;
let servidor;
before(async () => {
  bd = await crearBaseDatosPrueba();
  if (!bd) return;
  const servicios = crearServicios(bd.pool);
  await asegurarAdministrador(servicios.repositorios, { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  servidor = await iniciarServidor(crearApp({ pool: bd.pool, servicios }));
});
after(async () => {
  await servidor?.cerrar();
  await bd?.destruir();
});

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

const post = (ruta, cuerpo, cabeceras = {}) => fetch(servidor.url + ruta, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras },
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
});
const entrar = async () => (await (await post('/api/auth/login', { email: 'admin@ejemplo.es', clave: 'clave-larga-123' })).json()).token;

prueba('sin token, la API responde 401 (también en rutas que no existen)', async () => {
  for (const ruta of ['/api/auth/yo', '/api/clientes', '/api/lo-que-sea']) {
    const r = await fetch(servidor.url + ruta);
    assert.equal(r.status, 401, ruta);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  }
});

prueba('login correcto → token que da acceso; la respuesta no incluye datos sensibles', async () => {
  const r = await post('/api/auth/login', { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.ok(cuerpo.token && cuerpo.expiraEn);
  assert.ok(!JSON.stringify(cuerpo).includes('clave_hash'));
  const yo = await fetch(servidor.url + '/api/auth/yo', { headers: { Authorization: `Bearer ${cuerpo.token}` } });
  assert.equal(yo.status, 200);
  const { usuario } = await yo.json();
  assert.equal(usuario.email, 'admin@ejemplo.es');
  assert.equal(typeof usuario.id, 'number'); // el id es un número, no un texto
});

prueba('login incorrecto → 401 con mensaje genérico', async () => {
  const r = await post('/api/auth/login', { email: 'admin@ejemplo.es', clave: 'mala' });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, 'Email o contraseña incorrectos');
});

prueba('login con datos mal formados → 400 (JSON roto, tipos incorrectos, campos vacíos)', async () => {
  assert.equal((await post('/api/auth/login', '{roto')).status, 400);
  assert.equal((await post('/api/auth/login', { email: { $ne: '' }, clave: 'x' })).status, 400);
  assert.equal((await post('/api/auth/login', { email: 'a@b.es' })).status, 400);
  assert.equal((await post('/api/auth/login', { email: 'a@b.es', clave: 'x'.repeat(500) })).status, 400);
});

prueba('un token inventado o con otro esquema no da acceso', async () => {
  const token = await entrar();
  const con = (valor) => fetch(servidor.url + '/api/auth/yo', { headers: { Authorization: valor } });
  assert.equal((await con('Bearer inventado')).status, 401);
  assert.equal((await con(`Basic ${token}`)).status, 401);
  assert.equal((await con(token)).status, 401);
  assert.equal((await con(`bearer ${token}`)).status, 200); // el esquema no distingue mayúsculas
});

prueba('logout invalida el token', async () => {
  const token = await entrar();
  const cabeceras = { Authorization: `Bearer ${token}` };
  assert.equal((await post('/api/auth/logout', {}, cabeceras)).status, 204);
  assert.equal((await fetch(servidor.url + '/api/auth/yo', { headers: cabeceras })).status, 401);
});

prueba('las respuestas llevan cabeceras de seguridad y la API no se guarda en caché', async () => {
  const r = await fetch(servidor.url + '/api/auth/yo');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-powered-by'), null);
});

prueba('una petición JSON demasiado grande se rechaza con 413', async () => {
  const r = await post('/api/auth/login', { email: 'a@b.es', clave: 'x'.repeat(200_000) });
  assert.equal(r.status, 413);
});
