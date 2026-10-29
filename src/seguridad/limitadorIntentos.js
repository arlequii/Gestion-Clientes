// Límite de intentos fallidos de login (protege de adivinar contraseñas).
//
// Cuenta los fallos por clave (origen + email). Tras `maximo` fallos dentro
// de la ventana de tiempo, bloquea esa clave hasta que la ventana termine.
// Está en memoria: sirve para una sola instancia del servidor. Con varias
// instancias habría que guardarlo en la base de datos.

export class LimitadorIntentos {
  /**
   * @param {{ maximo?: number, ventanaMs?: number, ahora?: () => number }} [opciones]
   *   `ahora` se puede sustituir en los tests para simular el paso del tiempo.
   */
  constructor({ maximo = 5, ventanaMs = 15 * 60 * 1000, ahora = Date.now } = {}) {
    this.maximo = maximo;
    this.ventanaMs = ventanaMs;
    this.ahora = ahora;
    this.fallos = new Map(); // clave → { cantidad, desde }
  }

  /** Devuelve la entrada vigente de una clave, o undefined si no hay o ya caducó. */
  #vigente(clave) {
    const entrada = this.fallos.get(clave);
    if (entrada && this.ahora() - entrada.desde >= this.ventanaMs) {
      this.fallos.delete(clave);
      return undefined;
    }
    return entrada;
  }

  estaBloqueado(clave) {
    return (this.#vigente(clave)?.cantidad ?? 0) >= this.maximo;
  }

  registrarFallo(clave) {
    // Limpieza ocasional para que el mapa no crezca sin límite.
    if (this.fallos.size > 10_000) {
      for (const k of this.fallos.keys()) this.#vigente(k);
    }
    const entrada = this.#vigente(clave);
    if (entrada) entrada.cantidad++;
    else this.fallos.set(clave, { cantidad: 1, desde: this.ahora() });
  }

  reiniciar(clave) {
    this.fallos.delete(clave);
  }
}
