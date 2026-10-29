// Tests de la lectura del CSV, del planificador y de la importación completa.
// Los de importación necesitan PostgreSQL (se omiten si no hay).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leerCsv } from '../src/importacion/csv.js';
import { planificar } from '../src/importacion/planificar.js';
import { importarTexto, importarSiNuncaSeImporto } from '../src/importacion/importador.js';
import { crearBaseDatosPrueba } from './ayudas/baseDatosPrueba.js';

const RUTA_CSV = 'datos/clientes_antiguos.csv';
const csv = await readFile(RUTA_CSV, 'utf8');
const CABECERA = csv.split('\n')[0].trim();

// ---- Lector CSV -----------------------------------------------------------

test('csv: lee las 18 filas del fichero real, con comillas y tildes', () => {
  const filas = leerCsv(csv);
  assert.equal(filas.length, 18);
  assert.equal(filas[0].numeroFila, 2); // la cabecera es la fila 1
  assert.equal(filas[0].datos.pais, 'España');
  assert.equal(filas[9].datos.email, ' Lucia@ClinicaSonrisa.es'); // celda entrecomillada, con el espacio original
});

test('csv: avisa con claridad si el separador es la coma', () => {
  assert.throws(() => leerCsv(CABECERA.replaceAll(';', ',') + '\n'), /separador es la coma/);
});

test('csv: avisa si la codificación está estropeada', () => {
  assert.throws(() => leerCsv(csv.replace('España', 'EspaÃ±a')), /codificación/);
});

test('csv: avisa si una fila tiene columnas de más o de menos', () => {
  assert.throws(() => leerCsv(`${CABECERA}\na;b;c\n`), /fila 2 tiene 3 columnas/);
});

test('csv: admite BOM, saltos de línea de Windows y comillas con ; dentro', () => {
  const fila = Array(16).fill('').map((_, i) => (i === 0 ? '"Mi; ""Empresa"""' : 'x')).join(';');
  const [r] = leerCsv(`\uFEFF${CABECERA}\r\n${fila}\r\n\r\n`);
  assert.equal(r.datos.empresa, 'Mi; "Empresa"');
});

// ---- Planificador (sin base de datos) -------------------------------------

const plan = planificar(leerCsv(csv));
const fila = (n) => plan.filas.find((f) => f.numeroFila === n);

test('plan: resultado de cada fila problemática del CSV', () => {
  assert.equal(fila(9).resultado, 'rechazada');   // F-2026-0108: 31/09/2026
  assert.match(fila(9).motivo, /no existe/);
  assert.equal(fila(15).resultado, 'rechazada');  // F-2026-0113: sin base
  assert.match(fila(15).motivo, /falta el importe/);
  assert.equal(fila(16).resultado, 'pendiente');  // Hotel Mar Blau sin CIF
  assert.equal(fila(18).resultado, 'duplicada');  // F-2026-0115 repetida
  assert.equal(fila(14).resultado, 'importada');  // Atelier Lumière: cliente sin facturas
});

test('plan: los duplicados disfrazados se fusionan por CIF', () => {
  assert.equal(plan.clientes.length, 7);
  const ebro = plan.clientes.find((c) => c.cif === 'B50123456');
  assert.equal(ebro.empresa, 'Construcciones Ebro SL'); // gana la primera fila
  assert.deepEqual(ebro.contactos.map((c) => c.nombre), ['Marta Gil', 'Pablo Ruiz']);
  assert.equal(ebro.facturas.length, 4);
  const duero = plan.clientes.find((c) => c.cif === 'B47222333');
  assert.equal(duero.contactos.length, 1); // misma persona con el email en mayúsculas
});

test('plan: variantes de país, estado y comercial quedan unificadas', () => {
  const ebro = plan.clientes.find((c) => c.cif === 'B50123456');
  assert.equal(ebro.comercial, 'Elena Sanz');
  assert.ok(plan.clientes.every((c) => ['España', 'Portugal', 'Italia', 'Francia'].includes(c.pais)));
  assert.ok(plan.clientes.every((c) => ['Activo', 'Inactivo'].includes(c.estado)));
  assert.equal(plan.clientes.find((c) => c.cif === 'IT01234560967').comercial, 'Elena Sanz'); // "Elena  Sanz"
});

test('plan: las interpretaciones dudosas generan avisos', () => {
  assert.ok(fila(4).avisos.some((a) => /dos cifras/.test(a)));
  assert.ok(fila(4).avisos.some((a) => /punto decimal/.test(a)));
  // El aviso del dígito de control sale una vez por cliente, no en cada fila.
  const conControl = plan.filas.filter((f) => f.avisos.some((a) => /dígito de control/.test(a)));
  assert.equal(conControl.length, 3); // Ebro, Sonrisa y Duero (el de Mar Blau sí es correcto)
});

test('plan: mismo número de factura con datos distintos → las dos filas quedan pendientes', () => {
  const base = leerCsv(csv).find((f) => f.numeroFila === 2);
  const otra = { numeroFila: 3, datos: { ...base.datos, base_imponible: '999,00' } };
  const p = planificar([base, otra]);
  assert.deepEqual(p.filas.map((f) => f.resultado), ['pendiente', 'pendiente']);
  assert.equal(p.clientes.length, 0); // no se importa ninguna
});

test('plan: un CIF con formato de otro país se rechaza', () => {
  const base = leerCsv(csv).find((f) => f.numeroFila === 2);
  const p = planificar([{ numeroFila: 2, datos: { ...base.datos, cif: 'PT509876543' } }]);
  assert.equal(p.filas[0].resultado, 'rechazada');
  assert.match(p.filas[0].motivo, /no válido para España/);
});

// ---- Importación completa (PostgreSQL) --------------------------------------

let bd = null;
before(async () => { bd = await crearBaseDatosPrueba(); });
after(async () => { await bd?.destruir(); });

function prueba(nombre, fn) {
  test(nombre, async (t) => {
    if (!bd) return t.skip('PostgreSQL no disponible');
    await fn(t);
  });
}

let informe;
prueba('importar: guarda 7 clientes, 8 contactos y 13 facturas', async () => {
  informe = await importarTexto(bd.pool, csv, 'clientes_antiguos.csv');
  assert.deepEqual(
    [informe.resumen.clientesCreados, informe.resumen.contactosCreados, informe.resumen.facturasCreadas],
    [7, 8, 13]);
  assert.deepEqual(
    [informe.resumen.importadas, informe.resumen.duplicadas, informe.resumen.rechazadas, informe.resumen.pendientes],
    [14, 1, 2, 1]);
});

prueba('importar: el cuadre de bases imponibles no tiene diferencia', async () => {
  assert.deepEqual(informe.cuadre, {
    fichero: '18952.85', importadas: '17202.05', duplicadas: '520.80',
    rechazadas: '450.00', pendientes: '780.00', diferencia: '0.00',
  });
});

prueba('importar: la facturación acumulada de Ebro suma 4.175,90 € sin IVA', async () => {
  const { rows } = await bd.pool.query(
    `SELECT sum(f.base_imponible) AS acumulada FROM facturas f JOIN clientes c ON c.id = f.cliente_id WHERE c.cif = 'B50123456'`);
  assert.equal(rows[0].acumulada, '4175.90');
});

prueba('importar: conserva el cero del código postal y las fechas correctas', async () => {
  const { rows } = await bd.pool.query(`SELECT cp, to_char(fecha_alta, 'YYYY-MM-DD') AS alta FROM clientes WHERE cif IN ('A07123987', 'B28765432') ORDER BY cif`);
  assert.deepEqual(rows, [{ cp: '07014', alta: '2025-06-12' }, { cp: '28028', alta: '2025-03-05' }]);
});

prueba('importar: guarda el informe fila a fila y el histórico de altas', async () => {
  const { rows: filas } = await bd.pool.query('SELECT resultado, count(*)::int AS n FROM importacion_filas GROUP BY 1 ORDER BY 1');
  assert.deepEqual(filas, [
    { resultado: 'duplicada', n: 1 }, { resultado: 'importada', n: 14 },
    { resultado: 'pendiente', n: 1 }, { resultado: 'rechazada', n: 2 }]);
  const { rows: [h] } = await bd.pool.query(`SELECT count(*)::int AS n FROM historico_cambios WHERE accion = 'alta'`);
  assert.equal(h.n, 7 + 8);
});

prueba('importar: repetir la importación no duplica nada', async () => {
  const otra = await importarTexto(bd.pool, csv, 'otra.csv');
  assert.deepEqual(
    [otra.resumen.clientesCreados, otra.resumen.contactosCreados, otra.resumen.facturasCreadas], [0, 0, 0]);
  const { rows } = await bd.pool.query('SELECT (SELECT count(*) FROM clientes)::int AS c, (SELECT count(*) FROM facturas)::int AS f');
  assert.deepEqual(rows[0], { c: 7, f: 13 });
  assert.equal(otra.cuadre.diferencia, '0.00');
});

prueba('importar: un CSV con formato incorrecto no guarda nada', async () => {
  await assert.rejects(importarTexto(bd.pool, 'a,b,c\n1,2,3', 'malo.csv'), /columnas esperadas/);
  const { rows } = await bd.pool.query('SELECT count(*)::int AS n FROM importaciones');
  assert.equal(rows[0].n, 2); // solo las dos importaciones anteriores
});

prueba('importar al arrancar: solo si nunca se ha importado', async () => {
  assert.equal(await importarSiNuncaSeImporto(bd.pool, RUTA_CSV), null); // ya hay importaciones
  const vacia = await crearBaseDatosPrueba();
  try {
    const r = await importarSiNuncaSeImporto(vacia.pool, RUTA_CSV);
    assert.equal(r.resumen.clientesCreados, 7);
  } finally {
    await vacia.destruir();
  }
});

test('plan: una factura con base negativa (abono) se importa', () => {
  const base = leerCsv(csv).find((f) => f.numeroFila === 2);
  const p = planificar([{ numeroFila: 2, datos: { ...base.datos, factura: 'AB-1', base_imponible: '-250,00' } }]);
  assert.equal(p.filas[0].resultado, 'importada');
  assert.equal(p.clientes[0].facturas[0].baseCentimos, -25000);
});
