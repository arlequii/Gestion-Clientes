// Lectura y validación de la configuración.
//
// Toda la configuración llega por variables de entorno (ver .env.example).
// Se valida una sola vez al arrancar: si falta algo o es incorrecto, la
// aplicación se detiene con un mensaje claro en lugar de fallar más tarde
// con un error poco explícito.

const ENTORNOS = ['development', 'production', 'test'];

/**
 * Convierte el texto de una variable en un número entero dentro de un rango.
 * Si no es válido, añade un mensaje a la lista de errores y devuelve undefined.
 */
function leerEntero(env, nombre, porDefecto, minimo, maximo, errores) {
  const texto = env[nombre] ?? String(porDefecto);
  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    errores.push(`${nombre} debe ser un número entero entre ${minimo} y ${maximo} (valor recibido: "${texto}")`);
    return undefined;
  }
  return numero;
}

/**
 * Lee un texto obligatorio. Si falta o está vacío, anota el error.
 */
function leerObligatoria(env, nombre, errores) {
  const valor = env[nombre];
  if (valor === undefined || valor.trim() === '') {
    errores.push(`${nombre} es obligatoria y no tiene valor`);
    return undefined;
  }
  return valor;
}

/**
 * Devuelve la configuración de la aplicación a partir de las variables de
 * entorno. Recibe `env` como parámetro (por defecto process.env) para poder
 * probarla con valores inventados.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {object} configuración ya validada y congelada
 * @throws {Error} si alguna variable falta o no es válida (lista todos los problemas)
 */
export function leerConfiguracion(env = process.env) {
  const errores = [];

  const entorno = env.NODE_ENV ?? 'development';
  if (!ENTORNOS.includes(entorno)) {
    errores.push(`NODE_ENV debe ser uno de: ${ENTORNOS.join(', ')} (valor recibido: "${entorno}")`);
  }

  // Administrador inicial. La contraseña es opcional: si falta se genera una al arrancar.
  const adminEmail = (env.ADMIN_EMAIL ?? 'admin@ejemplo.es').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) errores.push(`ADMIN_EMAIL no es un email válido (valor recibido: "${adminEmail}")`);
  const adminClave = env.ADMIN_PASSWORD?.trim() || undefined;
  if (adminClave && adminClave.length < 10) errores.push('ADMIN_PASSWORD debe tener al menos 10 caracteres (o dejarse vacía para generar una)');

  const configuracion = {
    entorno,
    admin: { email: adminEmail, clave: adminClave },
    // true cuando la web se sirve por HTTPS: la cookie de sesión pasa a ser "segura".
    cookieSegura: (env.COOKIE_SECURE ?? 'false').trim().toLowerCase() === 'true',
    // Importar datos/clientes_antiguos.csv en el primer arranque (true por defecto).
    importarAlArrancar: (env.IMPORTAR_AL_ARRANCAR ?? 'true').trim().toLowerCase() !== 'false',
    puerto: leerEntero(env, 'PORT', 3000, 1, 65535, errores),
    baseDatos: {
      host: leerObligatoria(env, 'DB_HOST', errores),
      puerto: leerEntero(env, 'DB_PORT', 5432, 1, 65535, errores),
      nombre: leerObligatoria(env, 'DB_NAME', errores),
      usuario: leerObligatoria(env, 'DB_USER', errores),
      clave: leerObligatoria(env, 'DB_PASSWORD', errores),
    },
  };

  if (errores.length > 0) {
    throw new Error(`Configuración no válida:\n- ${errores.join('\n- ')}`);
  }

  return Object.freeze(configuracion);
}
