// Tests del servicio de clientes con PostgreSQL real y los datos reales del CSV importado.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';
import { importarTexto } from '../src/importacion/importador.js';
import { crearServicios } from '../src/servicios/index.js';

let bd = null;
let clientes;
let usuario;
before(async () => {
  bd = await crearBaseDatosPrueba();
  if (!bd) return;
  await importarTexto(bd.pool, await readFile('datos/clientes_antiguos.csv', 'utf8'), 'clientes_antiguos.csv');
  const servicios = crearServicios(bd.pool);
  clientes = servicios.clientes;
  usuario = await servicios.repositorios.usuarios.crear({ email: 'ana@ejemplo.es', nombre: 'Ana', claveHash: 'x' });
});
after(async () => { await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

const empresas = async (consulta) => (await clientes.listar(consulta)).datos.map((c) => c.empresa);
const idPorCif = async (cif) => (await bd.pool.query('SELECT id FROM clientes WHERE cif = $1', [cif])).rows[0].id;
const falla = (promesa, estado, texto) => assert.rejects(promesa, (e) => e.estado === estado && (!texto || texto.test(e.message)));
const NUEVO = { empresa: 'Taller Nuevo SL', cif: 'B12345674', pais: 'España', ciudad: 'Girona',
  contactos: [{ nombre: 'Marc Vila', email: 'marc@tallernuevo.es', telefono: '972 11 22 33' }] };

// ---- Listado ----

prueba('listar: paginación con total y número de páginas', async () => {
  const p1 = await clientes.listar({ porPagina: '3' });
  assert.equal(p1.datos.length, 3);
  assert.deepEqual(p1.paginacion, { pagina: 1, porPagina: 3, total: 7, totalPaginas: 3 });
  const p3 = await clientes.listar({ porPagina: '3', pagina: '3' });
  assert.equal(p3.datos.length, 1);
  assert.equal((await clientes.listar({ pagina: '99' })).datos.length, 0);
});

prueba('listar: busca por empresa (sin tildes ni mayúsculas), contacto, CIF y email', async () => {
  assert.deepEqual(await empresas({ q: 'CLINICA' }), ['Clínica Dental Sonrisa SLP']);
  assert.deepEqual(await empresas({ q: 'pablo ruiz' }), ['Construcciones Ebro SL']);
  assert.deepEqual(await empresas({ q: 'b-50123456' }), ['Construcciones Ebro SL']);
  assert.deepEqual(await empresas({ q: 'brera-cultura' }), ['Associazione Culturale Brera']);
  assert.deepEqual(await empresas({ q: 'joão' }), ['Vinhos do Porto Lda']);
});

prueba('listar: % y _ se buscan como texto, no como comodines', async () => {
  assert.deepEqual(await empresas({ q: '%' }), []);
  assert.deepEqual(await empresas({ q: '_' }), []);
});

prueba('listar: filtros por estado, país y comercial (también combinados)', async () => {
  assert.deepEqual(await empresas({ estado: 'Inactivo' }), ['Logística Duero SL']);
  assert.deepEqual(await empresas({ pais: 'Italia' }), ['Associazione Culturale Brera']);
  assert.deepEqual(await empresas({ pais: 'Spain' }), (await empresas({ pais: 'España' }))); // acepta alias
  const carmen = (await clientes.comerciales()).find((c) => c.nombre === 'Carmen Vega').id;
  assert.equal((await clientes.listar({ comercial: String(carmen) })).paginacion.total, 3);
  assert.deepEqual(await empresas({ comercial: String(carmen), estado: 'Inactivo' }), ['Logística Duero SL']);
});

prueba('listar: ordena por facturación acumulada y la devuelve como texto con 2 decimales', async () => {
  const { datos } = await clientes.listar({ orden: 'facturacion', direccion: 'desc' });
  assert.equal(datos[0].empresa, 'Hotel Mar Blau SA');
  assert.equal(datos[0].facturacionAcumulada, '5570.00');
  assert.equal(datos.at(-1).facturacionAcumulada, '0.00'); // Atelier Lumière, sin facturas
});

prueba('listar: parámetros inválidos dan 400 con el detalle de cada uno', async () => {
  await assert.rejects(clientes.listar({ pagina: '0', porPagina: '500', estado: 'raro', orden: 'DROP TABLE' }),
    (e) => e.estado === 400 && ['pagina', 'porPagina', 'estado', 'orden'].every((c) => e.detalles[c]));
});

// ---- Ficha ----

prueba('obtener: ficha con contactos, facturas y facturación acumulada sin IVA', async () => {
  const ebro = await clientes.obtener(await idPorCif('B50123456'));
  assert.equal(ebro.facturacionAcumulada, '4175.90');
  assert.equal(ebro.contactos.length, 2);
  assert.equal(ebro.facturas.length, 4);
  assert.equal(ebro.comercial.nombre, 'Elena Sanz');
  assert.deepEqual(ebro.facturas.find((f) => f.numero === 'F-2026-0102'),
    { id: ebro.facturas.find((f) => f.numero === 'F-2026-0102').id, numero: 'F-2026-0102', fechaFactura: '2026-09-17',
      baseImponible: '1875.60', ivaPorcentaje: '21.00', total: '2269.48' });
  await falla(clientes.obtener(99999), 404);
});

// ---- Crear ----

prueba('crear: guarda cliente y contactos y anota el alta en el histórico', async () => {
  const { cliente, avisos } = await clientes.crear(NUEVO, usuario);
  assert.equal(cliente.estado, 'Activo');
  assert.equal(cliente.facturacionAcumulada, '0.00');
  assert.equal(cliente.contactos[0].email, 'marc@tallernuevo.es');
  assert.deepEqual(avisos, []);
  const h = await clientes.historico(cliente.id, {});
  assert.deepEqual(h.datos.map((c) => [c.entidad, c.accion, c.registro, c.usuario]).sort(),
    [['cliente', 'alta', 'Cliente: Taller Nuevo SL', 'ana@ejemplo.es'], ['contacto', 'alta', 'Contacto: Marc Vila', 'ana@ejemplo.es']]);
});

prueba('crear: devuelve todos los errores a la vez, incluidos los de los contactos', async () => {
  await assert.rejects(clientes.crear({ empresa: '', cif: 'XX', pais: 'Narnia', estado: 'Raro', fechaAlta: '31/09/2026',
    contactos: [{ nombre: 'A', email: 'no-es-email' }] }, usuario),
  (e) => e.estado === 400 && ['empresa', 'pais', 'estado', 'fechaAlta', 'contactos.0.email'].every((c) => e.detalles[c]));
  await assert.rejects(clientes.crear({ ...NUEVO, contactos: [] }, usuario), (e) => Boolean(e.detalles.contactos));
  await assert.rejects(clientes.crear([], usuario), (e) => e.estado === 400);
});

prueba('crear: el CIF debe corresponder al país y el dígito de control solo avisa', async () => {
  await assert.rejects(clientes.crear({ ...NUEVO, cif: 'PT509876544', cif2: 1 }, usuario), (e) => /formato válido para España/.test(e.detalles.cif));
  const { avisos, cliente } = await clientes.crear({ ...NUEVO, empresa: 'Otro SL', cif: 'b-12345679', contactos: [{ nombre: 'X Y', email: 'x@otro.es' }] }, usuario);
  assert.equal(cliente.cif, 'B12345679'); // normalizado
  assert.match(avisos[0], /dígito de control/);
});

prueba('crear: CIF repetido (también de un cliente en la papelera) → 409 y no queda nada a medias', async () => {
  await falla(clientes.crear({ ...NUEVO, contactos: [{ nombre: 'Otro', email: 'otro@x.es' }] }, usuario), 409, /CIF/);
  const antes = (await bd.pool.query('SELECT count(*)::int AS n FROM contactos')).rows[0].n;
  // Contacto repetido dentro de la misma petición.
  await falla(clientes.crear({ ...NUEVO, cif: 'B87654321', contactos: [NUEVO.contactos[0], NUEVO.contactos[0]] }, usuario), 400);
  assert.equal((await bd.pool.query('SELECT count(*)::int AS n FROM contactos')).rows[0].n, antes);
});

prueba('crear: un comercial inexistente se rechaza', async () => {
  await assert.rejects(clientes.crear({ ...NUEVO, cif: 'B11223344', comercialId: 9999 }, usuario), (e) => Boolean(e.detalles.comercialId));
});

// ---- Actualizar ----

prueba('actualizar: anota un cambio por campo con valor anterior, nuevo y usuario', async () => {
  const id = await idPorCif('B47222333'); // Logística Duero
  const antes = (await clientes.obtener(id)).modificadoEn;
  const carmenId = (await clientes.comerciales()).find((c) => c.nombre === 'Elena Sanz').id;
  await new Promise((r) => setTimeout(r, 15));
  const { cliente } = await clientes.actualizar(id, { ciudad: 'Burgos', estado: 'Activo', comercialId: carmenId, empresa: 'Logística Duero SL' }, usuario);
  assert.ok(cliente.modificadoEn > antes);
  assert.equal(cliente.comercial.nombre, 'Elena Sanz');

  const cambios = (await clientes.historico(id, {})).datos.filter((c) => c.accion === 'modificacion');
  assert.deepEqual(cambios.map((c) => [c.campo, c.valorAnterior, c.valorNuevo]).sort(),
    [['ciudad', 'Valladolid', 'Burgos'], ['comercial', 'Carmen Vega', 'Elena Sanz'], ['estado', 'Inactivo', 'Activo']]);
  assert.ok(cambios.every((c) => c.usuario === 'ana@ejemplo.es' && c.fecha && c.registro === 'Cliente: Logística Duero SL'));
});

prueba('actualizar: sin cambios reales no se anota nada ni cambia la fecha', async () => {
  const id = await idPorCif('A07123987');
  const antes = await clientes.obtener(id);
  const { cliente } = await clientes.actualizar(id, { ciudad: antes.ciudad, empresa: antes.empresa }, usuario);
  assert.equal(String(cliente.modificadoEn), String(antes.modificadoEn));
  assert.equal((await clientes.historico(id, {})).datos.filter((c) => c.accion === 'modificacion').length, 0);
});

prueba('actualizar: solo cambia lo enviado y se puede vaciar un campo opcional', async () => {
  const id = await idPorCif('IT01234560967');
  const { cliente } = await clientes.actualizar(id, { direccion: null }, usuario);
  assert.equal(cliente.direccion, null);
  assert.equal(cliente.ciudad, 'Milano'); // intacto
});

prueba('actualizar: validación (CIF contra el país nuevo), CIF duplicado y cliente inexistente', async () => {
  const id = await idPorCif('PT509876543');
  await assert.rejects(clientes.actualizar(id, { pais: 'España' }, usuario), (e) => e.estado === 400 && Boolean(e.detalles.cif));
  await falla(clientes.actualizar(id, { cif: 'IT01234560967', pais: 'Italia' }, usuario), 409);
  await falla(clientes.actualizar(99999, { ciudad: 'X' }, usuario), 404);
});

// ---- Baja y restauración ----

prueba('eliminar: borrado lógico, se oculta, se anota y se puede restaurar', async () => {
  const id = await idPorCif('FR12345678901');
  await clientes.eliminar(id, usuario);
  assert.ok(!(await empresas({ pais: 'Francia' })).length);
  assert.deepEqual(await empresas({ eliminados: 'true' }), ['Atelier Lumière SARL']);
  assert.ok((await clientes.obtener(id)).eliminadoEn); // la ficha sigue accesible
  await falla(clientes.eliminar(id, usuario), 409);
  await falla(clientes.actualizar(id, { ciudad: 'Lyon' }, usuario), 409, /restáuralo/);
  await falla(clientes.crearContacto(id, { nombre: 'A', email: 'a@b.fr' }, usuario), 409);

  const restaurado = await clientes.restaurar(id, usuario);
  assert.equal(restaurado.eliminadoEn, null);
  await falla(clientes.restaurar(id, usuario), 409);
  assert.deepEqual((await clientes.historico(id, {})).datos.map((c) => c.accion).filter((a) => a !== 'alta'), ['restauracion', 'baja']);
});

prueba('papelera: mover y restaurar varios a la vez; repetir la acción no falla y omite los que ya estaban así', async () => {
  const ids = [await idPorCif('FR12345678901'), await idPorCif('B28765432')];
  const antes = await clientes.contarPapelera();

  assert.deepEqual(await clientes.eliminarVarios(ids, usuario), { cambiados: 2, omitidos: 0 });
  assert.equal(await clientes.contarPapelera(), antes + 2);
  // Ya estaban en la papelera (y un id que no existe): se omiten sin error.
  assert.deepEqual(await clientes.eliminarVarios([...ids, ...ids, 999999], usuario), { cambiados: 0, omitidos: 3 });

  assert.deepEqual(await clientes.restaurarVarios(ids, usuario), { cambiados: 2, omitidos: 0 });
  assert.equal(await clientes.contarPapelera(), antes);

  // Cada cliente conserva en su histórico lo ocurrido (lo más reciente primero).
  const acciones = (await clientes.historico(ids[0], {})).datos.map((c) => c.accion).filter((a) => a !== 'alta');
  assert.deepEqual(acciones.slice(0, 2), ['restauracion', 'baja']);
});

prueba('papelera: un lote vacío o de más de 100 clientes se rechaza con 400 y no cambia nada', async () => {
  const antes = await clientes.contarPapelera();
  await falla(clientes.eliminarVarios([], usuario), 400);
  await falla(clientes.restaurarVarios(Array.from({ length: 101 }, (_, i) => i + 1), usuario), 400);
  assert.equal(await clientes.contarPapelera(), antes);
});

// ---- Contactos ----

prueba('contactos: alta, modificación y baja quedan en el histórico y actualizan la fecha del cliente', async () => {
  const id = await idPorCif('B28765432');
  const antes = (await clientes.obtener(id)).modificadoEn;
  await new Promise((r) => setTimeout(r, 15));

  const nuevo = await clientes.crearContacto(id, { nombre: 'Sara Gómez', email: 'SARA@clinicasonrisa.es' }, usuario);
  assert.equal(nuevo.email, 'sara@clinicasonrisa.es');
  const editado = await clientes.actualizarContacto(id, nuevo.id, { telefono: '600 111 222', nombre: 'Sara Gómez Ruiz' }, usuario);
  assert.equal(editado.telefono, '600 111 222');
  await clientes.eliminarContacto(id, nuevo.id, usuario);

  const h = (await clientes.historico(id, {})).datos.filter((c) => c.entidad === 'contacto' && c.registro.includes('Sara'));
  assert.deepEqual(h.map((c) => [c.accion, c.campo]).sort(), [['alta', null], ['eliminacion', null], ['modificacion', 'nombre'], ['modificacion', 'telefono']]);
  assert.ok((await clientes.obtener(id)).modificadoEn > antes);
});

prueba('contactos: email repetido → 409; no se puede eliminar el último; contacto ajeno → 404', async () => {
  const ebro = await clientes.obtener(await idPorCif('B50123456'));
  await falla(clientes.crearContacto(ebro.id, { nombre: 'Otra', email: 'MARTA.GIL@construccionesebro.es' }, usuario), 409);
  const atelier = await clientes.obtener(await idPorCif('FR12345678901'));
  await falla(clientes.eliminarContacto(atelier.id, atelier.contactos[0].id, usuario), 409, /al menos un contacto/);
  await falla(clientes.actualizarContacto(atelier.id, ebro.contactos[0].id, { nombre: 'X' }, usuario), 404);
});

// ---- Histórico ----

prueba('histórico: paginado, más reciente primero, y 404 si el cliente no existe', async () => {
  const id = await idPorCif('B47222333');
  const p = await clientes.historico(id, { porPagina: '2' });
  assert.equal(p.datos.length, 2);
  assert.ok(p.paginacion.total > 2 && p.paginacion.totalPaginas > 1);
  assert.ok(p.datos[0].fecha >= p.datos[1].fecha);
  await falla(clientes.historico(99999, {}), 404);
});

prueba('mensajes de validación: neutros y asociados a su campo', async () => {
  await assert.rejects(clientes.crear({ pais: 'España', contactos: [{ nombre: '', email: '' }] }, usuario), (e) =>
    e.detalles.empresa === 'Campo obligatorio' && e.detalles.cif === 'Campo obligatorio'
    && e.detalles['contactos.0.nombre'] === 'Campo obligatorio' && /email/i.test(e.detalles['contactos.0.email']));
});
