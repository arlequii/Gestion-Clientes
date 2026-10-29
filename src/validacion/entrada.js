// Utilidades para validar lo que llega de fuera (API y formularios).
//
// Idea: se recorren TODOS los campos y se acumulan los errores, para poder
// decirle al usuario todo lo que está mal de una vez, no de uno en uno.

import { ErrorAplicacion } from '../errores.js';

/** Acumula errores por campo y los lanza juntos como un 400. */
export class Errores {
  constructor() { this.campos = {}; }
  agregar(campo, mensaje) { this.campos[campo] ??= mensaje; } // se conserva el primero de cada campo
  lanzarSiHay() {
    if (Object.keys(this.campos).length > 0) throw new ErrorAplicacion(400, 'Hay datos no válidos', this.campos);
  }
}

/** La entrada debe ser un objeto (no un array, texto, null...). */
export function exigirObjeto(entrada) {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ErrorAplicacion(400, 'El cuerpo de la petición debe ser un objeto JSON');
  }
  return entrada;
}

/**
 * Lee un texto opcional u obligatorio.
 * Los mensajes son neutros porque el error siempre va asociado a su campo.
 * Devuelve undefined si no se envió, null si se envió vacío, o el texto limpio.
 */
export function leerTexto(entrada, campo, errores, { obligatorio = false, max } = {}) {
  const valor = entrada[campo];
  if (valor === undefined) {
    return undefined;
  }
  if (valor !== null && typeof valor !== 'string') {
    errores.agregar(campo, 'Debe ser un texto');
    return undefined;
  }
  const limpio = (valor ?? '').replace(/\s+/g, ' ').trim();
  if (limpio === '') {
    if (obligatorio) errores.agregar(campo, 'Campo obligatorio');
    return null;
  }
  if (limpio.length > max) {
    errores.agregar(campo, `No puede superar los ${max} caracteres`);
    return undefined;
  }
  return limpio;
}

/** Un identificador de la URL ("12"). Si no es un número entero positivo, es como si no existiera: 404. */
export function leerId(texto) {
  if (!/^\d{1,15}$/.test(String(texto)) || Number(texto) < 1) {
    throw new ErrorAplicacion(404, 'Recurso no encontrado');
  }
  return Number(texto);
}

/** Entero positivo recibido como número o como texto ("3"). Devuelve null si no lo es. */
export function enteroPositivo(valor) {
  if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) return valor;
  if (typeof valor === 'string' && /^\d{1,15}$/.test(valor) && Number(valor) > 0) return Number(valor);
  return null;
}

/**
 * Lee `pagina` y `porPagina` de la query string.
 * @returns {{ pagina: number, porPagina: number }}
 */
export function leerPaginacion(query, { porPaginaPorDefecto = 10, maximo = 100 } = {}) {
  const errores = new Errores();
  const numero = (campo, porDefecto, tope) => {
    if (query[campo] === undefined || query[campo] === '') return porDefecto;
    const n = enteroPositivo(query[campo]);
    if (n === null || n > tope) errores.agregar(campo, `${campo} debe ser un entero entre 1 y ${tope}`);
    return n ?? porDefecto;
  };
  const resultado = {
    pagina: numero('pagina', 1, 1_000_000),
    porPagina: numero('porPagina', porPaginaPorDefecto, maximo),
  };
  errores.lanzarSiHay();
  return resultado;
}

/** Datos de paginación para la respuesta. */
export function describirPaginacion({ pagina, porPagina }, total) {
  return { pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
}

/**
 * Ejecuta varias validaciones independientes y, si alguna falla, lanza UN solo
 * 400 con los errores de todas. Devuelve la lista de resultados en el mismo orden.
 * @param {(() => any)[]} validaciones
 */
export function validarVarias(...validaciones) {
  const detalles = {};
  const resultados = validaciones.map((validar) => {
    try {
      return validar();
    } catch (error) {
      if (!(error instanceof ErrorAplicacion) || !error.detalles) throw error;
      Object.assign(detalles, error.detalles);
      return null;
    }
  });
  if (Object.keys(detalles).length > 0) throw new ErrorAplicacion(400, 'Hay datos no válidos', detalles);
  return resultados;
}
