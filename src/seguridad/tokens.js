// Tokens de sesión: cadenas aleatorias imposibles de adivinar.
//
// Al usuario se le entrega el token; en la base de datos solo se guarda su
// hash (SHA-256). Así, si alguien lee la tabla de sesiones, no puede usar
// ningún token. SHA-256 basta aquí porque el token ya es aleatorio y largo
// (a diferencia de una contraseña elegida por una persona).

import { randomBytes, createHash } from 'node:crypto';

/** 32 bytes aleatorios (256 bits) en texto seguro para cabeceras y cookies. */
export function generarToken() {
  return randomBytes(32).toString('base64url');
}

export function hashDeToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
