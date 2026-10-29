import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euros, fecha, fechaHora } from '../src/vistas/filtros.js';
import { leerCookie, nombreCookieSesion, opcionesCookieSesion } from '../src/seguridad/cookies.js';
import { construirUrl } from '../src/routes/web/clientes.js';

// Intl usa espacios "duros" (U+00A0); se normalizan para comparar.
const sinNbsp = (t) => t.replace(/[\u00a0\u202f]/g, ' ');

test('euros: formato español con coma decimal', () => {
  assert.equal(sinNbsp(euros('1875.60')), '1875,60 €');
  assert.equal(sinNbsp(euros('0.00')), '0,00 €');
  assert.equal(sinNbsp(euros('12345.5')), '12.345,50 €');
  assert.equal(euros(null), '');
});

test('fecha y fechaHora: formato dd/mm/aaaa y hora de Madrid', () => {
  assert.equal(fecha('2025-01-14'), '14/01/2025');
  assert.equal(fecha(null), '');
  assert.equal(sinNbsp(fechaHora(new Date('2026-10-29T12:05:00Z'))), '29/10/2026, 13:05'); // octubre: UTC+1... o +2 según DST
});

test('cookies: se lee la correcta entre varias y se ignoran las mal formadas', () => {
  assert.equal(leerCookie('a=1; sesion=abc%2Fdef; b=2', 'sesion'), 'abc/def');
  assert.equal(leerCookie('a=1', 'sesion'), undefined);
  assert.equal(leerCookie(undefined, 'sesion'), undefined);
  assert.equal(leerCookie('sesion=%E0%A4%A', 'sesion'), undefined);
  assert.equal(leerCookie('xsesion=1', 'sesion'), undefined);
});

test('cookie de sesión: HttpOnly y SameSite siempre; Secure y __Host- con HTTPS', () => {
  assert.equal(nombreCookieSesion({ cookieSegura: false }), 'sesion');
  assert.equal(nombreCookieSesion({ cookieSegura: true }), '__Host-sesion');
  const o = opcionesCookieSesion({ cookieSegura: true });
  assert.deepEqual([o.httpOnly, o.sameSite, o.secure, o.path], [true, 'lax', true, '/']);
});

test('construirUrl: conserva filtros, omite vacíos y codifica caracteres especiales', () => {
  assert.equal(construirUrl({ q: 'a&b', estado: 'Activo' }, { pagina: 2 }), '/clientes?q=a%26b&estado=Activo&pagina=2');
  assert.equal(construirUrl({ q: 'x' }, { q: '' }), '/clientes');
  assert.equal(construirUrl({ pagina: '3' }, { pagina: undefined }), '/clientes');
});
