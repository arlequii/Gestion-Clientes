// La interfaz web por HTTP real: login, sesión por cookie, seguridad y listado.

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
let servicios;
before(async () => {
  bd = await crearBaseDatosPrueba();
  if (!bd) return;
  await importarTexto(bd.pool, await readFile('datos/clientes_antiguos.csv', 'utf8'), 'c.csv');
  servicios = crearServicios(bd.pool);
  await asegurarAdministrador(servicios.repositorios, { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  servidor = await iniciarServidor(crearApp({ pool: bd.pool, servicios }));
});
after(async () => { await servidor?.cerrar(); await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

const pedir = (ruta, opciones = {}) => fetch(servidor.url + ruta, { redirect: 'manual', ...opciones });
const formulario = (datos) => ({
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(datos).toString(),
});

/** Inicia sesión por el formulario y devuelve la cabecera Cookie lista para usar. */
async function entrar() {
  const r = await pedir('/login', formulario({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }));
  return r.headers.get('set-cookie').split(';')[0];
}
const conSesion = async (ruta, extra = {}) => pedir(ruta, { headers: { Cookie: await entrar(), ...extra } });

prueba('sin sesión, las páginas redirigen al login; htmx recibe 401 con HX-Redirect', async () => {
  const r = await pedir('/clientes');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login');
  const h = await pedir('/clientes', { headers: { 'HX-Request': 'true' } });
  assert.equal(h.status, 401);
  assert.equal(h.headers.get('hx-redirect'), '/login');
});

prueba('la página de login es HTML en español con CSP estricta y sin scripts en línea', async () => {
  const r = await pedir('/login');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /name="clave"/);
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'no debe haber <script> en línea');
  assert.ok(!/\son\w+\s*=/i.test(html), 'no debe haber manejadores on... en línea');
  assert.ok(!/\sstyle\s*=/i.test(html), 'no debe haber estilos en línea');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!csp.includes('unsafe'));
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

prueba('login incorrecto: vuelve al formulario con mensaje, conserva el email y no da cookie', async () => {
  const r = await pedir('/login', formulario({ email: 'admin@ejemplo.es', clave: 'mala' }));
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
  const html = await r.text();
  assert.match(html, /Email o contraseña incorrectos/);
  assert.match(html, /value="admin@ejemplo.es"/);
});

prueba('login: el email se muestra escapado (sin XSS) y los campos vacíos dan 400', async () => {
  const r = await pedir('/login', formulario({ email: '"><script>alert(1)</script>', clave: 'x' }));
  const html = await r.text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.equal((await pedir('/login', formulario({ email: '', clave: '' }))).status, 400);
});

prueba('login correcto: cookie HttpOnly + SameSite=Lax y redirección al listado', async () => {
  const r = await pedir('/login', formulario({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/clientes');
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /^sesion=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Expires=/);
});

prueba('un token de la API no vale como sesión web (ni al revés)', async () => {
  const { token } = await servicios.autenticacion.iniciarSesion({ email: 'admin@ejemplo.es', clave: 'clave-larga-123', tipo: 'api', origen: 'x' });
  assert.equal((await pedir('/clientes', { headers: { Cookie: `sesion=${token}` } })).status, 303);
  const cookie = await entrar();
  const api = await pedir('/api/clientes', { headers: { Authorization: `Bearer ${cookie.split('=')[1]}` } });
  assert.equal(api.status, 401);
});

prueba('listado: muestra los 7 clientes con facturación en formato español y paginación', async () => {
  const r = await conSesion('/clientes');
  assert.equal(r.status, 200);
  const html = await r.text();
  for (const e of ['Construcciones Ebro SL', 'Clínica Dental Sonrisa SLP', 'Atelier Lumière SARL']) assert.ok(html.includes(e), e);
  assert.match(html.replace(/[\u00a0\u202f]/g, ' '), /4175,90 €/);
  assert.match(html, /Mostrando 1–7 de 7/);
  assert.match(html, /<option value="Italia"/);
  assert.match(html, /Elena Sanz/); // desplegable de comerciales
  assert.match(html, /Gestión de clientes/);
});

prueba('listado: filtros y búsqueda desde la URL (sin tildes), y el orden se refleja en la cabecera', async () => {
  const cookie = await entrar();
  const html = await (await pedir('/clientes?q=clinica&estado=Activo', { headers: { Cookie: cookie } })).text();
  assert.ok(html.includes('Clínica Dental Sonrisa SLP'));
  assert.ok(!html.includes('Construcciones Ebro'));
  assert.match(html, /value="clinica"/);
  const ordenado = await (await pedir('/clientes?orden=facturacion&direccion=desc', { headers: { Cookie: cookie } })).text();
  assert.match(ordenado, /aria-sort="descending"/);
  assert.ok(ordenado.indexOf('Hotel Mar Blau') < ordenado.indexOf('Atelier'));
});

prueba('listado: la búsqueda reflejada en la página se escapa (sin XSS)', async () => {
  const html = await (await pedir('/clientes?q=' + encodeURIComponent('"><img src=x onerror=alert(1)>'), { headers: { Cookie: await entrar() } })).text();
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /No hay clientes que coincidan/);
});

prueba('listado: paginación con enlaces que conservan los filtros', async () => {
  const html = await (await pedir('/clientes?porPagina=3&q=s', { headers: { Cookie: await entrar() } })).text();
  assert.match(html, /Mostrando 1–3 de/);
  assert.match(html, /href="\/clientes\?q=s&amp;porPagina=3&amp;pagina=2"/);
  assert.match(html, /aria-current="page"/);
});

prueba('htmx: devuelve solo el fragmento; al volver atrás (history restore) devuelve la página entera', async () => {
  const cookie = await entrar();
  const frag = await pedir('/clientes?q=ebro', { headers: { Cookie: cookie, 'HX-Request': 'true' } });
  const textoFrag = await frag.text();
  assert.ok(textoFrag.includes('Construcciones Ebro'));
  assert.ok(!textoFrag.includes('<html') && !textoFrag.includes('<nav class="navbar'));
  assert.match(frag.headers.get('vary'), /HX-Request/);
  assert.equal(frag.headers.get('hx-push-url'), '/clientes?q=ebro'); // URL limpia, sin parámetros vacíos
  const completa = await (await pedir('/clientes', { headers: { Cookie: cookie, 'HX-Request': 'true', 'HX-History-Restore-Request': 'true' } })).text();
  assert.ok(completa.includes('<html'));
});

prueba('parámetros inválidos en la URL: aviso amable en lugar de un error', async () => {
  const r = await conSesion('/clientes?pagina=abc&estado=raro');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /no era válido y se ha ignorado/);
  assert.ok(html.includes('Construcciones Ebro'));
});

prueba('CSRF: un envío desde otro sitio se rechaza; desde el propio sitio funciona', async () => {
  const ajeno = await pedir('/login', { ...formulario({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://sitio-malicioso.example' } });
  assert.equal(ajeno.status, 403);
  assert.equal(ajeno.headers.get('set-cookie'), null);
  const cruzado = await pedir('/login', { ...formulario({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(cruzado.status, 403);
  const propio = await pedir('/login', { ...formulario({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: servidor.url, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(propio.status, 303);
});

prueba('logout: invalida la sesión y borra la cookie; desde otro sitio no se puede forzar', async () => {
  const cookie = await entrar();
  const ajeno = await pedir('/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://malo.example' } });
  assert.equal(ajeno.status, 403);
  assert.equal((await pedir('/clientes', { headers: { Cookie: cookie } })).status, 200); // sigue activa
  const r = await pedir('/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('set-cookie'), /sesion=;/);
  assert.equal((await pedir('/clientes', { headers: { Cookie: cookie } })).status, 303); // ya no vale
});

prueba('ficheros estáticos locales (Bootstrap, iconos, htmx, CSS propio) y páginas de error en HTML', async () => {
  for (const ruta of ['/vendor/bootstrap/css/bootstrap.min.css', '/vendor/bootstrap/js/bootstrap.bundle.min.js',
    '/vendor/bootstrap-icons/bootstrap-icons.min.css', '/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
    '/vendor/htmx/htmx.min.js', '/static/css/app.css']) {
    assert.equal((await pedir(ruta)).status, 200, ruta);
  }
  assert.equal((await pedir('/vendor/../package.json')).status, 303); // no se puede salir de la carpeta
  const r = await conSesion('/pagina-que-no-existe');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /no existe/);
});
