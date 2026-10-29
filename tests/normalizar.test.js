import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearFecha, parsearImporte, parsearIva, normalizarEmail, normalizarEstado,
  capitalizarSiHaceFalta, claveTelefono,
} from '../src/importacion/normalizar.js';
import { normalizarCif, normalizarPais, cifTieneFormatoValido, controlEspanolCorrecto } from '../src/dominio/paises.js';

test('fechas: los cuatro formatos del Excel dan la misma fecha', () => {
  for (const t of ['14/01/2025', '14-01-2025', '2025-01-14', '14/1/2025']) {
    assert.equal(parsearFecha(t).valor, '2025-01-14', t);
  }
});

test('fechas: año de dos cifras = 20xx con aviso; el día va antes que el mes', () => {
  const r = parsearFecha('5/3/25');
  assert.equal(r.valor, '2025-03-05');
  assert.match(r.aviso, /dos cifras/);
});

test('fechas: las que no existen o no se entienden se rechazan, no se corrigen', () => {
  assert.match(parsearFecha('31/09/2026').error, /septiembre de 2026 solo tiene 30 días/);
  assert.match(parsearFecha('29/02/2025').error, /febrero de 2025 solo tiene 28 días/);
  for (const t of ['31/09/2026', '29/02/2025', '13/13/2025', '2025/01/14', 'ayer', '']) {
    assert.equal(parsearFecha(t).ok, false, t);
  }
  assert.equal(parsearFecha('29/02/2024').valor, '2024-02-29'); // año bisiesto
});

test('importes: miles con punto, decimales con coma, símbolo €', () => {
  assert.equal(parsearImporte('1.875,60').valor, 187560);
  assert.equal(parsearImporte('980,40 €').valor, 98040);
  assert.equal(parsearImporte('3.420,00').valor, 342000);
  assert.equal(parsearImporte('415,25').valor, 41525);
  assert.equal(parsearImporte('890').valor, 89000);
});

test('importes: punto + 3 cifras son miles; punto + 1 o 2 cifras son decimales con aviso', () => {
  assert.equal(parsearImporte('1.250').valor, 125000);
  assert.equal(parsearImporte('1.250').aviso, undefined);
  const r = parsearImporte('640.5');
  assert.equal(r.valor, 64050);
  assert.match(r.aviso, /punto decimal/);
  assert.equal(parsearImporte('1.25').valor, 125);
});

test('importes: el signo menos indica abonos y rectificativas', () => {
  assert.equal(parsearImporte('-1.250,00').valor, -125000);
  assert.equal(parsearImporte('-640.5 €').valor, -64050);
  assert.equal(parsearImporte('-0').valor, 0);
});

test('importes: lo que no se puede interpretar se rechaza', () => {
  for (const t of ['12,345', '', 'abc', '1,2,3', '--5', '5-', '1.2.3']) {
    assert.equal(parsearImporte(t).ok, false, t);
  }
});

test('IVA: con o sin %, vacío o fuera de rango se rechaza', () => {
  assert.equal(parsearIva('21%').valor, 21);
  assert.equal(parsearIva('21').valor, 21);
  assert.equal(parsearIva('0').valor, 0);
  assert.equal(parsearIva('10,5 %').valor, 10.5);
  assert.equal(parsearIva('').ok, false);
  assert.equal(parsearIva('150').ok, false);
});

test('email, estado y textos', () => {
  assert.equal(normalizarEmail(' Lucia@ClinicaSonrisa.es').valor, 'lucia@clinicasonrisa.es');
  assert.equal(normalizarEmail('sin-arroba').ok, false);
  assert.equal(normalizarEstado('ACTIVO').valor, 'Activo');
  assert.equal(normalizarEstado('pendiente').ok, false);
  assert.equal(capitalizarSiHaceFalta('elena  sanz'), 'Elena Sanz');
  assert.equal(capitalizarSiHaceFalta('ZARAGOZA'), 'Zaragoza');
  assert.equal(capitalizarSiHaceFalta('San Sebastián'), 'San Sebastián'); // ya bien escrito: no se toca
  assert.equal(claveTelefono('+34 983 445 566'), claveTelefono('983 44 55 66'));
});

test('países y CIF', () => {
  assert.equal(normalizarPais('Spain'), 'España');
  assert.equal(normalizarPais('ESPAÑA'), 'España');
  assert.equal(normalizarPais('PT'), 'Portugal');
  assert.equal(normalizarPais('Italy'), 'Italia');
  assert.equal(normalizarPais('Narnia'), null);
  assert.equal(normalizarCif('b-50123456'), 'B50123456');
  assert.ok(cifTieneFormatoValido('B50123456', 'España'));
  assert.ok(cifTieneFormatoValido('IT01234560967', 'Italia'));
  assert.ok(cifTieneFormatoValido('PT509876543', 'Portugal'));
  assert.ok(cifTieneFormatoValido('FR12345678901', 'Francia'));
  assert.ok(!cifTieneFormatoValido('PT509876543', 'España')); // un IVA portugués no vale para un cliente español
});

test('dígito de control español (NIF, NIE y CIF)', () => {
  assert.ok(controlEspanolCorrecto('12345678Z'));   // NIF
  assert.ok(!controlEspanolCorrecto('12345678A'));
  assert.ok(controlEspanolCorrecto('X1234567L'));   // NIE
  assert.ok(controlEspanolCorrecto('A58818501'));   // CIF con control numérico
  assert.ok(controlEspanolCorrecto('Q2826000H'));   // CIF con control en letra
  assert.ok(!controlEspanolCorrecto('B50123456'));  // el del Excel de ejemplo no lo cumple
});
