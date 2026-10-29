// Países admitidos y validación de CIF/NIF/IVA intracomunitario.
//
// Vive en "dominio" porque lo usan tanto el importador como los formularios
// y la API de clientes: todas las vías deben aplicar las mismas reglas.

// `alias` son las formas en que aparece el país en el Excel antiguo (ya sin
// tildes y en minúsculas). `formatoCif` es el formato del identificador fiscal.
const PAISES = [
  { nombre: 'España', alias: ['españa', 'espana', 'spain', 'es'], formatoCif: /^(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/ },
  { nombre: 'Portugal', alias: ['portugal', 'pt'], formatoCif: /^PT\d{9}$/ },
  { nombre: 'Italia', alias: ['italia', 'italy', 'it'], formatoCif: /^IT\d{11}$/ },
  { nombre: 'Francia', alias: ['francia', 'france', 'fr'], formatoCif: /^FR[0-9A-Z]{2}\d{9}$/ },
];

export const NOMBRES_PAISES = PAISES.map((p) => p.nombre);

/** Quita tildes y pasa a minúsculas, para comparar textos sin fijarse en cómo se escribieron. */
export function sinTildes(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Devuelve el nombre oficial del país ("Spain" → "España") o null si no se conoce. */
export function normalizarPais(texto) {
  const clave = sinTildes(String(texto ?? '').trim());
  return PAISES.find((p) => p.alias.includes(clave))?.nombre ?? null;
}

/** Mayúsculas y sin espacios, puntos ni guiones: "b-50123456" → "B50123456". */
export function normalizarCif(texto) {
  return String(texto ?? '').toUpperCase().replace(/[\s.\-]/g, '');
}

/** ¿Tiene el formato correcto para ese país? (No mira el dígito de control.) */
export function cifTieneFormatoValido(cif, pais) {
  return PAISES.find((p) => p.nombre === pais)?.formatoCif.test(cif) ?? false;
}

const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Comprueba el dígito de control de un NIF, NIE o CIF español.
 * Se usa solo para AVISAR: varios CIF de ejemplo del Excel no lo cumplen.
 */
export function controlEspanolCorrecto(cif) {
  // NIF (8 cifras + letra) y NIE (X/Y/Z + 7 cifras + letra): la letra sale de dividir entre 23.
  if (/^\d{8}[A-Z]$/.test(cif) || /^[XYZ]\d{7}[A-Z]$/.test(cif)) {
    const numero = Number(cif.slice(0, -1).replace('X', '0').replace('Y', '1').replace('Z', '2'));
    return LETRAS_NIF[numero % 23] === cif.slice(-1);
  }
  // CIF (letra + 7 cifras + control, que puede ser cifra o letra).
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(cif)) {
    const cifras = cif.slice(1, 8).split('').map(Number);
    let suma = 0;
    cifras.forEach((c, i) => {
      if (i % 2 === 0) { const doble = c * 2; suma += Math.floor(doble / 10) + (doble % 10); } // posiciones impares: se duplica
      else suma += c;
    });
    const control = (10 - (suma % 10)) % 10;
    return cif.slice(-1) === String(control) || cif.slice(-1) === 'JABCDEFGHI'[control];
  }
  return false;
}
