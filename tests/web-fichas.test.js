// Ficha, formularios, baja con doble verificación, contactos, histórico y ayuda
// de la interfaz web, probados por HTTP real contra PostgreSQL.

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
let cookie;
let idEbro;

const urlEncoded = (datos) => new URLSearchParams(datos).toString();
const pedir = (ruta, opciones = {}) => fetch(servidor.url + ruta, { redirect: 'manual', ...opciones });
const ver = (ruta) => pedir(ruta, { headers: { Cookie: cookie } });
const enviar = (ruta, datos = {}, cabeceras = {}) => pedir(ruta, {
  method: 'POST', body: urlEncoded(datos),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, ...cabeceras },
});

before(async () => {
  bd = await crearBaseDatosPrueba();
  if (!bd) return;
  await importarTexto(bd.pool, await readFile('datos/clientes_antiguos.csv', 'utf8'), 'c.csv');
  servicios = crearServicios(bd.pool);
  await asegurarAdministrador(servicios.repositorios, { email: 'admin@ejemplo.es', clave: 'clave-larga-123' });
  servidor = await iniciarServidor(crearApp({ pool: bd.pool, servicios }));

  const login = await pedir('/login', {
    method: 'POST', body: urlEncoded({ email: 'admin@ejemplo.es', clave: 'clave-larga-123' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  cookie = login.headers.get('set-cookie').split(';')[0];
  idEbro = (await servicios.clientes.listar({ q: 'ebro' })).datos[0].id;
});
after(async () => { await servidor?.cerrar(); await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

let contador = 0;
/** Datos válidos de un cliente nuevo, con CIF y email únicos para que los tests no choquen. */
function datosCliente(extra = {}) {
  contador += 1;
  return {
    empresa: `Talleres Prueba ${contador} SL`, cif: `B${1000000 + contador}0`, direccion: 'Calle Mayor 1', cp: '07014',
    ciudad: 'Palma', pais: 'España', estado: 'Activo', comercialId: '', fechaAlta: '2026-10-01',
    contactoNombre: 'Ana Pérez', contactoEmail: `ana${contador}@talleres.es`, contactoTelefono: '+34 600 111 222', ...extra,
  };
}

/** Da de alta un cliente por el formulario y devuelve su id y los datos enviados. */
async function altaWeb(extra) {
  const datos = datosCliente(extra);
  const r = await enviar('/clientes', datos);
  assert.equal(r.status, 303, await r.text());
  const id = Number(/^\/clientes\/(\d+)\?ok=creado$/.exec(r.headers.get('location'))[1]);
  return { id, datos };
}

prueba('la ficha muestra datos, contactos, facturas, facturación acumulada, histórico y el aviso del CIF', async () => {
  const r = await ver(`/clientes/${idEbro}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  for (const texto of ['Construcciones Ebro SL', 'Marta Gil', 'Pablo Ruiz', 'F-2026-0101', 'Histórico de cambios', 'data-bs-target="#modalBaja"']) {
    assert.ok(html.includes(texto), `falta: ${texto}`);
  }
  assert.match(html, /4\.?175,90/); // facturación acumulada sin IVA
  assert.match(html, /dígito de control del CIF/); // el CIF de ejemplo no cumple el control: aviso, no bloqueo
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'sin <script> en línea');
  assert.ok(!/\sstyle="/i.test(html), 'sin estilos en línea (los bloquea la CSP)');
});

prueba('un cliente que no existe o un id mal formado dan 404 con página de error', async () => {
  for (const ruta of ['/clientes/999999', '/clientes/abc', '/clientes/999999/editar']) {
    const r = await ver(ruta);
    assert.equal(r.status, 404, ruta);
    assert.match(await r.text(), /text-center/); // página de error amigable
  }
});

prueba('sin sesión, las páginas nuevas redirigen al login y los envíos no se aceptan', async () => {
  for (const ruta of ['/clientes/nuevo', `/clientes/${idEbro}`, '/ayuda']) {
    const r = await pedir(ruta);
    assert.equal(r.status, 303, ruta);
    assert.equal(r.headers.get('location'), '/login');
  }
  const r = await pedir(`/clientes/${idEbro}/baja`, { method: 'POST', body: urlEncoded({ confirmacion: 'B50123456' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login');
  assert.equal((await servicios.clientes.obtener(idEbro)).eliminadoEn, null);
});

prueba('el listado ofrece "Nuevo cliente" y enlaces para ver y editar cada cliente', async () => {
  const html = await (await ver('/clientes')).text();
  assert.ok(html.includes('href="/clientes/nuevo"'));
  assert.ok(html.includes(`href="/clientes/${idEbro}"`));
  assert.ok(html.includes(`href="/clientes/${idEbro}/editar"`));
});

prueba('el formulario de alta tiene la ayuda del CIF y valores por defecto', async () => {
  const html = await (await ver('/clientes/nuevo')).text();
  assert.match(html, /<form method="post" action="\/clientes">/);
  assert.match(html, /número de IVA con su prefijo/);
  assert.match(html, /name="contactoEmail"/);
  assert.match(html, /<option value="España" selected>/);
});

prueba('dar de alta un cliente guarda cliente y contacto, redirige a su ficha y queda en el histórico', async () => {
  const { id, datos } = await altaWeb();
  const html = await (await ver(`/clientes/${id}?ok=creado`)).text();
  assert.match(html, /Cliente creado correctamente/);
  assert.ok(html.includes(datos.empresa));
  assert.ok(html.includes('Ana Pérez'));
  assert.ok(html.includes(datos.contactoEmail)); // el email se guarda en minúsculas
  assert.match(html, /Alta/);
  assert.equal((await servicios.clientes.obtener(id)).cp, '07014'); // el 0 inicial se conserva
});

prueba('un alta con errores vuelve al formulario con 400, conserva lo escrito y no guarda nada', async () => {
  const antes = (await servicios.clientes.listar({})).paginacion.total;
  const r = await enviar('/clientes', datosCliente({ empresa: '', cif: 'XX', ciudad: 'Lleida', contactoEmail: 'no-es-email' }));
  assert.equal(r.status, 400);
  const html = await r.text();
  assert.match(html, /Revisa los campos marcados/);
  assert.match(html, /Campo obligatorio/);
  assert.match(html, /is-invalid/);
  assert.ok(html.includes('value="Lleida"'), 'debe conservar lo que se había escrito');
  assert.equal((await servicios.clientes.listar({})).paginacion.total, antes);
});

prueba('un CIF repetido se explica junto al campo (409)', async () => {
  const r = await enviar('/clientes', datosCliente({ cif: 'B50123456' }));
  assert.equal(r.status, 409);
  assert.match(await r.text(), /Ya existe un cliente con ese CIF/);
});

prueba('editar muestra el formulario relleno, guarda y anota el cambio en el histórico', async () => {
  const { id, datos } = await altaWeb();
  const formulario = await (await ver(`/clientes/${id}/editar`)).text();
  assert.ok(formulario.includes(`value="${datos.empresa}"`));
  assert.ok(!formulario.includes('name="contactoNombre"'), 'los contactos se editan desde la ficha');

  const r = await enviar(`/clientes/${id}`, { ...datos, ciudad: 'Lleida', estado: 'Inactivo' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), `/clientes/${id}?ok=guardado`);

  const html = await (await ver(`/clientes/${id}`)).text();
  assert.match(html, /Modificación/);
  assert.match(html, /Ciudad:/);
  assert.match(html, /Palma/); // valor anterior
  assert.match(html, /Lleida/); // valor nuevo
});

prueba('editar con datos no válidos vuelve al formulario con el error', async () => {
  const { id, datos } = await altaWeb();
  const r = await enviar(`/clientes/${id}`, { ...datos, empresa: '' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Campo obligatorio/);
});

prueba('baja con doble verificación: sin el CIF correcto no se da de baja; con él sí, y se puede restaurar', async () => {
  const { id, datos } = await altaWeb();

  const mal = await enviar(`/clientes/${id}/baja`, { confirmacion: 'OTRO' });
  assert.equal(mal.headers.get('location'), `/clientes/${id}?error=confirmacion`);
  const aviso = await (await ver(`/clientes/${id}?error=confirmacion`)).text();
  assert.match(aviso, /El CIF escrito no coincide/);
  assert.equal((await servicios.clientes.obtener(id)).eliminadoEn, null);

  // El CIF se acepta aunque se escriba en minúsculas o con guiones.
  const bien = await enviar(`/clientes/${id}/baja`, { confirmacion: datos.cif.toLowerCase() });
  assert.equal(bien.headers.get('location'), `/clientes/${id}?ok=baja`);
  const baja = await (await ver(`/clientes/${id}?ok=baja`)).text();
  assert.match(baja, /Restaurar cliente/);
  assert.ok(!baja.includes(`/clientes/${id}/editar`), 'un cliente de baja no se puede editar');
  assert.equal((await ver(`/clientes/${id}/editar`)).status, 303);
  assert.ok((await (await ver('/clientes?eliminados=true')).text()).includes(datos.empresa));

  const restaurar = await enviar(`/clientes/${id}/restaurar`);
  assert.equal(restaurar.headers.get('location'), `/clientes/${id}?ok=restaurado`);
  assert.ok((await (await ver(`/clientes/${id}`)).text()).includes(`/clientes/${id}/editar`));
});

prueba('contactos: añadir, rechazar un email repetido, editar y eliminar; el último no se puede eliminar', async () => {
  const { id, datos } = await altaWeb();
  const nuevo = { nombre: 'Luis Gómez', email: 'LUIS@talleres.es', telefono: '' };

  const alta = await enviar(`/clientes/${id}/contactos`, nuevo);
  assert.equal(alta.headers.get('location'), `/clientes/${id}?ok=contacto-creado#contactos`);
  assert.ok((await (await ver(`/clientes/${id}`)).text()).includes('luis@talleres.es'));

  const repetido = await enviar(`/clientes/${id}/contactos`, { ...nuevo, nombre: 'Otro Luis' });
  assert.equal(repetido.status, 409);
  assert.match(await repetido.text(), /Ya existe un contacto con ese email/);

  const invalido = await enviar(`/clientes/${id}/contactos`, { nombre: '', email: 'x', telefono: 'abc' });
  assert.equal(invalido.status, 400);

  const { contactos } = await servicios.clientes.obtener(id);
  const luis = contactos.find((c) => c.email === 'luis@talleres.es');
  assert.match(await (await ver(`/clientes/${id}/contactos/${luis.id}/editar`)).text(), /value="Luis Gómez"/);

  const edicion = await enviar(`/clientes/${id}/contactos/${luis.id}`, { ...nuevo, nombre: 'Luis Gómez Ruiz' });
  assert.equal(edicion.headers.get('location'), `/clientes/${id}?ok=contacto-guardado#contactos`);

  const baja = await enviar(`/clientes/${id}/contactos/${luis.id}/eliminar`);
  assert.equal(baja.headers.get('location'), `/clientes/${id}?ok=contacto-eliminado#contactos`);

  const ultimo = (await servicios.clientes.obtener(id)).contactos[0];
  const rechazo = await enviar(`/clientes/${id}/contactos/${ultimo.id}/eliminar`);
  assert.equal(rechazo.headers.get('location'), `/clientes/${id}?error=conflicto#contactos`);
  assert.match(await (await ver(`/clientes/${id}?error=conflicto`)).text(), /al menos un contacto/);
  assert.equal((await servicios.clientes.obtener(id)).contactos.length, 1);
  assert.ok(datos.contactoEmail);
});

prueba('un envío desde otro sitio web se rechaza (CSRF) y no cambia nada', async () => {
  const { id, datos } = await altaWeb();
  const r = await enviar(`/clientes/${id}/baja`, { confirmacion: datos.cif }, { Origin: 'http://sitio-ajeno.example' });
  assert.equal(r.status, 403);
  assert.equal((await servicios.clientes.obtener(id)).eliminadoEn, null);
});

prueba('el texto con HTML se escapa en la ficha (sin XSS)', async () => {
  const { id } = await altaWeb({ empresa: '<script>alert(1)</script> SL' });
  const html = await (await ver(`/clientes/${id}`)).text();
  assert.ok(html.includes('&lt;script&gt;alert(1)'));
  assert.ok(!html.includes('<script>alert(1)'));
});

prueba('el histórico se pagina de 20 en 20 y una página no válida muestra la primera', async () => {
  const { id, datos } = await altaWeb();
  for (let i = 0; i < 21; i += 1) {
    const r = await enviar(`/clientes/${id}`, { ...datos, ciudad: `Ciudad ${i}` });
    assert.equal(r.status, 303);
  }
  assert.match(await (await ver(`/clientes/${id}`)).text(), /Página 1 de 2/);
  assert.match(await (await ver(`/clientes/${id}?hpagina=2`)).text(), /Página 2 de 2/);
  const rota = await ver(`/clientes/${id}?hpagina=abc`);
  assert.equal(rota.status, 200);
  assert.match(await rota.text(), /Página 1 de 2/);
});

prueba('las claves de mensaje desconocidas no muestran nada (no se refleja texto de la dirección)', async () => {
  const html = await (await ver(`/clientes/${idEbro}?ok=<b>hola</b>&error=inventado`)).text();
  assert.ok(!html.includes('<b>hola</b>'));
  assert.ok(!/alert-success|alert-danger/.test(html));
});

prueba('la página de ayuda existe, está en español y se enlaza desde el menú', async () => {
  const r = await ver('/ayuda');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Mover un cliente a la papelera y restaurarlo/);
  assert.match(html, /Crear un cliente nuevo/);
  assert.ok(html.includes('href="/ayuda"'));
});

// ---------- Papelera, selección múltiple y pestañas ----------

/** Envío de un formulario con campos repetidos (varios "ids"), que un objeto simple no puede expresar. */
const enviarLista = (ruta, pares, cabeceras = {}) => pedir(ruta, {
  method: 'POST', body: new URLSearchParams(pares).toString(),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, ...cabeceras },
});

prueba('el listado tiene pestañas Clientes y Papelera, casillas de selección y botón de papelera, y ya no el botón Buscar ni la casilla de bajas', async () => {
  const html = await (await ver('/clientes')).text();
  assert.ok(html.includes('href="/clientes?eliminados=true"'), 'pestaña Papelera');
  assert.ok(html.includes('data-fila'), 'casillas de selección');
  assert.ok(html.includes('id="modalEliminar"') && html.includes('id="modalLote"'), 'ventanas de confirmación');
  assert.ok(html.includes(`data-id="${idEbro}"`), 'botón de papelera en cada fila');
  assert.ok(!html.includes('Mostrar solo clientes dados de baja'));
  assert.ok(!/Buscar\s*<\/button>/.test(html), 'sin botón Buscar');
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html) && !/\sstyle="/i.test(html), 'sin <script> ni estilos en línea');
});

prueba('mover varios a la papelera y restaurarlos: avisos, pestaña Papelera e histórico', async () => {
  const a = await altaWeb();
  const b = await altaWeb();

  const r = await enviarLista('/clientes/lote', [['accion', 'papelera'], ['ids', a.id], ['ids', b.id]]);
  assert.equal(r.headers.get('location'), '/clientes?ok=papelera&n=2');
  assert.match(await (await ver('/clientes?ok=papelera&n=2')).text(), /2 clientes movidos a la papelera/);
  assert.ok((await servicios.clientes.obtener(a.id)).eliminadoEn);

  const papelera = await (await ver('/clientes?eliminados=true')).text();
  assert.ok(papelera.includes(a.datos.empresa) && papelera.includes(b.datos.empresa));
  assert.match(papelera, /Restaurar seleccionados/);
  const normal = await (await ver(`/clientes?q=${encodeURIComponent(a.datos.empresa)}`)).text();
  assert.match(normal, /No hay clientes que coincidan/); // ya no sale en el listado normal

  // Repetir la acción no da error: se avisa de que no había nada que cambiar.
  const repetida = await enviarLista('/clientes/lote', [['accion', 'papelera'], ['ids', a.id]]);
  assert.equal(repetida.headers.get('location'), '/clientes?ok=papelera&n=0');
  assert.match(await (await ver('/clientes?ok=papelera&n=0')).text(), /No se ha cambiado ningún cliente/);

  // Restaurar uno desde la papelera (el formulario de su fila usa la misma ruta).
  const restaurado = await enviar('/clientes/lote', { accion: 'restaurar', ids: String(a.id) });
  assert.equal(restaurado.headers.get('location'), '/clientes?eliminados=true&ok=restaurados&n=1');
  assert.equal((await servicios.clientes.obtener(a.id)).eliminadoEn, null);
  assert.ok((await servicios.clientes.obtener(b.id)).eliminadoEn);
  await enviar('/clientes/lote', { accion: 'restaurar', ids: String(b.id) }); // se deja todo como estaba
});

prueba('lote: sin selección, acción inválida o ids falsos no cambian nada', async () => {
  const sinNada = await enviar('/clientes/lote', { accion: 'papelera' });
  assert.equal(sinNada.headers.get('location'), '/clientes?error=seleccion');
  assert.match(await (await ver('/clientes?error=seleccion')).text(), /Selecciona al menos un cliente/);

  const basura = await enviarLista('/clientes/lote', [['accion', 'papelera'], ['ids', 'abc'], ['ids', '-3'], ['ids', '0']]);
  assert.equal(basura.headers.get('location'), '/clientes?error=seleccion');

  assert.equal((await enviar('/clientes/lote', { accion: 'borrar', ids: String(idEbro) })).status, 400);
  assert.equal((await servicios.clientes.obtener(idEbro)).eliminadoEn, null);
});

prueba('lote: sin sesión redirige al login y un envío desde otro sitio se rechaza (CSRF)', async () => {
  const sinSesion = await pedir('/clientes/lote', { method: 'POST', body: urlEncoded({ accion: 'papelera', ids: String(idEbro) }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(sinSesion.headers.get('location'), '/login');

  const ajeno = await enviar('/clientes/lote', { accion: 'papelera', ids: String(idEbro) }, { Origin: 'http://sitio-ajeno.example' });
  assert.equal(ajeno.status, 403);
  assert.equal((await servicios.clientes.obtener(idEbro)).eliminadoEn, null);
});

prueba('los mensajes del listado salen solo de claves y números: el texto de la dirección no se refleja', async () => {
  const html = await (await ver('/clientes?ok=papelera&n=<b>x</b>&error=inventado')).text();
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!/alert-success|alert-danger/.test(html));
});

prueba('la ficha tiene pestañas (Contactos por defecto, Histórico al paginar) y el histórico muestra una columna Detalle', async () => {
  const normal = await (await ver(`/clientes/${idEbro}`)).text();
  assert.match(normal, /id="pestana-contactos"[^>]*aria-selected="true"/);
  assert.match(normal, /id="pestana-historico"[^>]*aria-selected="false"/);
  for (const id of ['contactos', 'facturas', 'historico']) assert.ok(normal.includes(`data-bs-target="#${id}"`), id);

  const paginando = await (await ver(`/clientes/${idEbro}?hpagina=1`)).text();
  assert.match(paginando, /id="pestana-historico"[^>]*aria-selected="true"/);
  assert.match(paginando, />Detalle</);
  assert.ok(!paginando.includes('>Registro<'), 'sin la columna Registro');
});

