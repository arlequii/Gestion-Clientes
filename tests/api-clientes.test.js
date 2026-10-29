// La API de clientes por HTTP real: autenticación, códigos de estado y formato de las respuestas.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';
import { iniciarServidor } from './ayudas/servidor.js';
import { importarTexto } from '../src/importacion/importador.js';
import { crearApp } from '../src/app.js';
import { crearServicios } from '../src/servicios/index.js';
import { asegurarAdministrador } from '../src/servicios/administrador.js';

let bd = null;
let servidor;
let token;
before(async () => {
  bd = await crearBaseDatosPrueba();
  if (!bd) return;
  await importarTexto(bd.pool, await readFile('datos/clientes_antiguos.csv', 'utf8'), 'c.csv');
  const servicios = crearServicios(bd.pool);
  await asegurarAdministrador(servicios.repositorios, { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  servidor = await iniciarServidor(crearApp({ pool: bd.pool, servicios }));
  token = (await servicios.autenticacion.iniciarSesion({ email: 'admin@ejemplo.es', clave: 'clave-larga-123', tipo: 'api', origen: 't' })).token;
});
after(async () => { await servidor?.cerrar(); await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

const api = (metodo, ruta, cuerpo, conToken = true) => fetch(servidor.url + ruta, {
  method: metodo,
  headers: { 'Content-Type': 'application/json', ...(conToken ? { Authorization: `Bearer ${token}` } : {}) },
  body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
});

prueba('ninguna ruta de clientes responde sin token', async () => {
  for (const [m, r] of [['GET', '/api/clientes'], ['GET', '/api/clientes/1'], ['POST', '/api/clientes'], ['PUT', '/api/clientes/1'],
    ['DELETE', '/api/clientes/1'], ['GET', '/api/clientes/1/historico'], ['POST', '/api/clientes/1/restaurar'], ['GET', '/api/comerciales']]) {
    assert.equal((await api(m, r, undefined, false)).status, 401, `${m} ${r}`);
  }
});

prueba('GET /api/clientes: listado paginado con búsqueda y filtros', async () => {
  const r = await api('GET', '/api/clientes?q=ebro&estado=activo&pais=España&porPagina=5');
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.equal(cuerpo.datos.length, 1);
  assert.equal(cuerpo.datos[0].empresa, 'Construcciones Ebro SL');
  assert.equal(cuerpo.datos[0].contactoPrincipal.nombre, 'Marta Gil');
  assert.equal(cuerpo.paginacion.total, 1);
  assert.equal((await api('GET', '/api/clientes?pagina=abc')).status, 400);
});

prueba('ciclo completo: crear (201 + Location) → consultar → modificar → histórico → eliminar (204) → restaurar', async () => {
  const alta = await api('POST', '/api/clientes', { empresa: 'Prueba HTTP SL', cif: 'B12345674', pais: 'España',
    contactos: [{ nombre: 'Laura', email: 'laura@prueba.es' }] });
  assert.equal(alta.status, 201);
  const cliente = await alta.json();
  assert.equal(alta.headers.get('location'), `/api/clientes/${cliente.id}`);
  assert.equal(typeof cliente.id, 'number');
  assert.ok(Array.isArray(cliente.avisos));

  const ficha = await (await api('GET', `/api/clientes/${cliente.id}`)).json();
  assert.equal(ficha.empresa, 'Prueba HTTP SL');

  const mod = await api('PUT', `/api/clientes/${cliente.id}`, { ciudad: 'Reus' });
  assert.equal((await mod.json()).ciudad, 'Reus');

  const hist = await (await api('GET', `/api/clientes/${cliente.id}/historico`)).json();
  assert.ok(hist.datos.some((c) => c.campo === 'ciudad' && c.valorAnterior === null && c.valorNuevo === 'Reus'));

  assert.equal((await api('DELETE', `/api/clientes/${cliente.id}`)).status, 204);
  assert.equal((await api('DELETE', `/api/clientes/${cliente.id}`)).status, 409);
  assert.equal((await api('POST', `/api/clientes/${cliente.id}/restaurar`)).status, 200);
});

prueba('errores: 400 con detalles por campo, 404, 409', async () => {
  const mala = await api('POST', '/api/clientes', { empresa: '', pais: 'X', contactos: [] });
  assert.equal(mala.status, 400);
  const cuerpo = await mala.json();
  assert.equal(cuerpo.error, 'Hay datos no válidos');
  assert.ok(cuerpo.detalles.empresa && cuerpo.detalles.pais);

  assert.equal((await api('GET', '/api/clientes/99999')).status, 404);
  assert.equal((await api('GET', '/api/clientes/abc')).status, 404);
  assert.equal((await api('GET', '/api/clientes/1; DROP TABLE clientes')).status, 404);
  assert.equal((await api('POST', '/api/clientes', { empresa: 'Dup', cif: 'B50123456', pais: 'España', contactos: [{ nombre: 'A', email: 'a@dup.es' }] })).status, 409);
});

prueba('contactos por HTTP: crear 201, modificar 200, eliminar 204', async () => {
  const lista = await (await api('GET', '/api/clientes?q=Sonrisa')).json();
  const id = lista.datos[0].id;
  const c = await api('POST', `/api/clientes/${id}/contactos`, { nombre: 'Nuria', email: 'nuria@clinica.es' });
  assert.equal(c.status, 201);
  const { id: cid } = await c.json();
  assert.equal((await (await api('PUT', `/api/clientes/${id}/contactos/${cid}`, { telefono: '611 222 333' })).json()).telefono, '611 222 333');
  assert.equal((await api('DELETE', `/api/clientes/${id}/contactos/${cid}`)).status, 204);
});

prueba('catálogos: comerciales y países para los filtros', async () => {
  const comerciales = (await (await api('GET', '/api/comerciales')).json()).datos;
  assert.deepEqual(comerciales.map((c) => c.nombre), ['Carmen Vega', 'Elena Sanz', 'Jordi Puig']);
  assert.deepEqual((await (await api('GET', '/api/paises')).json()).datos, ['España', 'Portugal', 'Italia', 'Francia']);
});

prueba('la API ignora campos que no debe poder fijar (id, fechas de control, eliminadoEn)', async () => {
  const lista = await (await api('GET', '/api/clientes?q=Brera')).json();
  const id = lista.datos[0].id;
  const r = await api('PUT', `/api/clientes/${id}`, { id: 9999, eliminadoEn: '2020-01-01', modificadoEn: '2000-01-01', creadoEn: '2000-01-01' });
  const cuerpo = await r.json();
  assert.equal(cuerpo.id, id);
  assert.equal(cuerpo.eliminadoEn, null);
  assert.notEqual(cuerpo.creadoEn.slice(0, 4), '2000');
});
