// Registro de eventos de la aplicación (lo que se ve en la terminal o en
// `docker compose logs`).
//
// En producción cada evento es una línea JSON, fácil de filtrar y de enviar a
// una herramienta de monitorización. En desarrollo es una línea de texto
// legible. En los tests no se escribe nada.
//
// Regla: no registrar nunca datos personales ni parámetros de URL.

/**
 * @param {'info'|'aviso'|'error'} nivel
 * @param {string} mensaje
 * @param {object} [datos] información adicional
 */
export function registrar(nivel, mensaje, datos = {}) {
  const entorno = process.env.NODE_ENV;
  if (entorno === 'test') return;

  const fecha = new Date().toISOString();
  const escribir = nivel === 'error' ? console.error : console.log;
  if (entorno === 'production') {
    escribir(JSON.stringify({ fecha, nivel, mensaje, ...datos }));
  } else {
    const extra = Object.keys(datos).length > 0 ? ` ${JSON.stringify(datos)}` : '';
    escribir(`${fecha} ${nivel.toUpperCase().padEnd(5)} ${mensaje}${extra}`);
  }
}
