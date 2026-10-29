// Contraseñas: nunca se guardan; se guarda un "hash" que no se puede revertir.
//
// Se usa scrypt (incluido en Node, sin dependencias): es lento a propósito,
// para que probar millones de contraseñas sea inviable. Cada contraseña lleva
// su propia "sal" aleatoria, así dos usuarios con la misma clave tienen
// hashes distintos.
//
// Formato guardado:  scrypt$N$r$p$sal$hash   (los parámetros van dentro, de
// modo que se pueden endurecer en el futuro sin invalidar los hashes antiguos).

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt);
const N = 16384, R = 8, P = 1, LONGITUD = 64;

/** @returns {Promise<string>} hash listo para guardar */
export async function hashearClave(clave) {
  const sal = randomBytes(16);
  const hash = await derivar(clave, sal, LONGITUD, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64'), hash.toString('base64')].join('$');
}

/** Comprueba una contraseña contra un hash guardado. Si el hash está mal formado, devuelve false. */
export async function verificarClave(clave, guardado) {
  const partes = String(guardado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  try {
    const calculado = await derivar(clave, Buffer.from(sal, 'base64'), esperado.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    // Comparación en tiempo constante: no revela cuántos caracteres coinciden.
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
