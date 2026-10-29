// Lector del CSV del Excel antiguo.
//
// Formato esperado: separador ";", UTF-8, primera fila con los nombres de
// columna. Si algo no cuadra, se lanza un error con un mensaje que explica
// qué corregir (en lugar de importar datos mal leídos sin avisar).

export const COLUMNAS = [
  'empresa', 'cif', 'contacto', 'email', 'telefono', 'direccion', 'cp', 'ciudad',
  'pais', 'comercial', 'estado', 'fecha_alta', 'factura', 'fecha_factura', 'base_imponible', 'iva',
];

/** Divide el texto en filas de celdas. Entiende comillas ("a;b" y "" dentro de comillas). */
function dividirEnFilas(texto) {
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ';') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length > 0) { fila.push(celda); filas.push(fila); }
  if (entreComillas) throw new Error('El CSV tiene unas comillas sin cerrar.');
  return filas;
}

/**
 * @param {string} texto contenido del fichero
 * @returns {{ numeroFila: number, datos: Record<string, string> }[]} filas con datos (la cabecera es la fila 1)
 * @throws {Error} si el formato no es el esperado
 */
export function leerCsv(texto) {
  // Texto UTF-8 leído como si fuera otra codificación: "España" → "EspaÃ±a".
  if (/Ã[\u0080-\u00BF]/.test(texto)) {
    throw new Error('El CSV parece tener la codificación estropeada (aparecen caracteres como "Ã±"). Guárdalo de nuevo como UTF-8.');
  }
  const filas = dividirEnFilas(texto.replace(/^\uFEFF/, ''));
  if (filas.length === 0) throw new Error('El CSV está vacío.');

  const cabecera = filas[0].map((c) => c.trim().toLowerCase());
  const faltan = COLUMNAS.filter((c) => !cabecera.includes(c));
  if (faltan.length > 0) {
    const pista = cabecera.length === 1 && cabecera[0].includes(',')
      ? ' Parece que el separador es la coma; debe ser punto y coma (;).' : '';
    throw new Error(`El CSV no tiene las columnas esperadas. Faltan: ${faltan.join(', ')}.${pista}`);
  }

  const resultado = [];
  filas.slice(1).forEach((celdas, i) => {
    if (celdas.every((c) => c.trim() === '')) return; // línea en blanco
    const numeroFila = i + 2;
    if (celdas.length !== cabecera.length) {
      throw new Error(`La fila ${numeroFila} tiene ${celdas.length} columnas y se esperaban ${cabecera.length}.`);
    }
    resultado.push({ numeroFila, datos: Object.fromEntries(cabecera.map((nombre, j) => [nombre, celdas[j]])) });
  });
  return resultado;
}
