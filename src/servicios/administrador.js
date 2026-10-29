// Creación del administrador inicial.
//
// Si todavía no existe ningún usuario, se crea uno con ADMIN_EMAIL y
// ADMIN_PASSWORD (del entorno, nunca del repositorio). Si no se indicó
// contraseña, se genera una aleatoria y se devuelve para mostrarla UNA vez
// en el log. Si ya hay usuarios no se toca nada: cambiar el .env después no
// cambia la contraseña de nadie.

import { randomBytes } from 'node:crypto';
import { hashearClave } from '../seguridad/claves.js';

/**
 * @param {{ usuarios: object }} repositorios
 * @param {{ email: string, clave?: string }} admin
 * @returns {Promise<{ creado: boolean, email?: string, claveGenerada?: string }>}
 */
export async function asegurarAdministrador({ usuarios }, { email, clave }) {
  if ((await usuarios.contar()) > 0) return { creado: false };

  const claveFinal = clave ?? randomBytes(12).toString('base64url');
  await usuarios.crear({ email, nombre: 'Administrador', claveHash: await hashearClave(claveFinal) });
  return { creado: true, email, claveGenerada: clave ? undefined : claveFinal };
}
