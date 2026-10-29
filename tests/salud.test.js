// Tests de la ruta /salud y de las respuestas generales de la aplicación.
// Usan una base de datos falsa, así que no necesitan PostgreSQL.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';

// Base de datos falsa cuyo comportamiento se puede cambiar en cada test.
let baseDatosDisponible = true;
const poolFalso = {
  async query() {
    if (!baseDatosDisponible) {
      throw new Error('conexión rechazada');
    }
    return { rows: [{ '?column?': 1 }] };
  },
};

let servidor;
let url;

before(async () => {
  const app = crearApp({ pool: poolFalso });
  // Puerto 0: el sistema asigna uno libre, así los tests no chocan con nada.
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
});

test('/salud responde 200 si la base de datos funciona', async () => {
  baseDatosDisponible = true;

  const respuesta = await fetch(`${url}/salud`);

  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { estado: 'ok' });
});

test('/salud responde 503 si la base de datos no está disponible', async () => {
  baseDatosDisponible = false;

  const respuesta = await fetch(`${url}/salud`);
  const cuerpo = await respuesta.json();

  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.estado, 'error');
  // No se filtran detalles internos del fallo.
  assert.ok(!JSON.stringify(cuerpo).includes('conexión rechazada'));
});

test('una página inexistente sin sesión redirige al login (no revela qué existe)', async () => {
  const respuesta = await fetch(`${url}/no-existe`, { redirect: 'manual' });

  assert.equal(respuesta.status, 303);
  assert.equal(respuesta.headers.get('location'), '/login');
});

test('no se anuncia la tecnología del servidor', async () => {
  baseDatosDisponible = true;

  const respuesta = await fetch(`${url}/salud`);

  assert.equal(respuesta.headers.get('x-powered-by'), null);
});
