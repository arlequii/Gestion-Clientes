// Tests de la lectura de configuración. No necesitan base de datos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerConfiguracion } from '../src/config/index.js';

// Variables mínimas válidas; cada test modifica solo lo que quiere probar.
const entornoValido = {
  DB_HOST: 'db',
  DB_NAME: 'clientes',
  DB_USER: 'clientes',
  DB_PASSWORD: 'secreta',
};

test('aplica los valores por defecto cuando solo están las variables obligatorias', () => {
  const config = leerConfiguracion(entornoValido);

  assert.equal(config.entorno, 'development');
  assert.equal(config.puerto, 3000);
  assert.equal(config.baseDatos.puerto, 5432);
  assert.equal(config.baseDatos.host, 'db');
});

test('lee los valores indicados en el entorno', () => {
  const config = leerConfiguracion({ ...entornoValido, NODE_ENV: 'production', PORT: '8080', DB_PORT: '5433' });

  assert.equal(config.entorno, 'production');
  assert.equal(config.puerto, 8080);
  assert.equal(config.baseDatos.puerto, 5433);
});

test('falla si falta una variable obligatoria y la nombra en el mensaje', () => {
  const { DB_PASSWORD, ...sinClave } = entornoValido;

  assert.throws(() => leerConfiguracion(sinClave), /DB_PASSWORD/);
});

test('falla si una variable obligatoria está vacía', () => {
  assert.throws(() => leerConfiguracion({ ...entornoValido, DB_USER: '   ' }), /DB_USER/);
});

test('rechaza un puerto que no es un número válido', () => {
  assert.throws(() => leerConfiguracion({ ...entornoValido, PORT: 'abc' }), /PORT/);
  assert.throws(() => leerConfiguracion({ ...entornoValido, PORT: '70000' }), /PORT/);
});

test('rechaza un entorno desconocido', () => {
  assert.throws(() => leerConfiguracion({ ...entornoValido, NODE_ENV: 'pruebas' }), /NODE_ENV/);
});

test('informa de todos los problemas a la vez', () => {
  assert.throws(
    () => leerConfiguracion({ PORT: 'abc' }),
    (error) => /PORT/.test(error.message) && /DB_HOST/.test(error.message) && /DB_PASSWORD/.test(error.message),
  );
});

test('la configuración devuelta no se puede modificar', () => {
  const config = leerConfiguracion(entornoValido);

  assert.throws(() => {
    config.puerto = 1;
  }, TypeError);
});
