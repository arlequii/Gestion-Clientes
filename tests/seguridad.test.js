// Tests unitarios de contraseñas, tokens y límite de intentos (no necesitan base de datos).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashearClave, verificarClave } from '../src/seguridad/claves.js';
import { generarToken, hashDeToken } from '../src/seguridad/tokens.js';
import { LimitadorIntentos } from '../src/seguridad/limitadorIntentos.js';

test('claves: la contraseña correcta se verifica y la incorrecta no', async () => {
  const hash = await hashearClave('mi-clave-segura');
  assert.equal(await verificarClave('mi-clave-segura', hash), true);
  assert.equal(await verificarClave('otra-clave', hash), false);
});

test('claves: el hash no contiene la contraseña y cada hash lleva su propia sal', async () => {
  const a = await hashearClave('misma-clave');
  const b = await hashearClave('misma-clave');
  assert.ok(!a.includes('misma-clave'));
  assert.notEqual(a, b);
  assert.equal(await verificarClave('misma-clave', b), true);
});

test('claves: un hash mal formado devuelve false en lugar de fallar', async () => {
  for (const basura of ['', 'texto', 'scrypt$1$2', 'md5$1$2$3$4$5', null]) {
    assert.equal(await verificarClave('x', basura), false);
  }
});

test('tokens: son distintos, largos, y su hash no revela el token', () => {
  const a = generarToken();
  const b = generarToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.notEqual(hashDeToken(a), a);
  assert.equal(hashDeToken(a), hashDeToken(a));
});

test('limitador: bloquea tras el máximo de fallos, solo a esa clave', () => {
  const l = new LimitadorIntentos({ maximo: 3 });
  for (let i = 0; i < 2; i++) l.registrarFallo('a');
  assert.equal(l.estaBloqueado('a'), false);
  l.registrarFallo('a');
  assert.equal(l.estaBloqueado('a'), true);
  assert.equal(l.estaBloqueado('b'), false);
});

test('limitador: un acierto reinicia la cuenta y la ventana de tiempo desbloquea', () => {
  let ahora = 0;
  const l = new LimitadorIntentos({ maximo: 2, ventanaMs: 1000, ahora: () => ahora });
  l.registrarFallo('a'); l.reiniciar('a'); l.registrarFallo('a');
  assert.equal(l.estaBloqueado('a'), false);
  l.registrarFallo('a');
  assert.equal(l.estaBloqueado('a'), true);
  ahora = 1000; // pasa la ventana
  assert.equal(l.estaBloqueado('a'), false);
});
