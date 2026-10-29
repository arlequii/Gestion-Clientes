// Error "esperado" de la aplicación: lleva el código HTTP y un mensaje que
// SÍ se puede mostrar al usuario. Cualquier otro error se trata como un fallo
// interno y no se muestra (ver el manejador de errores en app.js).

export class ErrorAplicacion extends Error {
  /**
   * @param {number} estado código HTTP (400, 401, 404, 429...)
   * @param {string} mensaje texto para el usuario
   * @param {object} [detalles] información extra, p. ej. los campos inválidos
   */
  constructor(estado, mensaje, detalles) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles;
  }
}
