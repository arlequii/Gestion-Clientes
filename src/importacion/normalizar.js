// Funciones que limpian y validan UN dato suelto del Excel antiguo.
//
// Todas son "puras": reciben un texto y devuelven un resultado, sin tocar la
// base de datos ni el fichero, lo que facilita probarlas.
//
// Las que pueden fallar o dudar devuelven un objeto:
//   { ok: true,  valor, aviso? }   → valor limpio (y, a veces, un aviso)
//   { ok: false, error }           → el dato no es válido

const ok = (valor, aviso) => (aviso ? { ok: true, valor, aviso } : { ok: true, valor });
const fallo = (error) => ({ ok: false, error });

/** Quita espacios sobrantes (también los dobles del interior). */
export function limpiarTexto(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/** "ZARAGOZA" o "elena sanz" → "Zaragoza" / "Elena Sanz". Un texto ya mezclado no se toca. */
export function capitalizarSiHaceFalta(texto) {
  const t = limpiarTexto(texto);
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, espacio, letra) => espacio + letra.toUpperCase());
}

/** Clave para comparar nombres: sin tildes, mayúsculas, puntos ni comas. */
export function clave(texto) {
  return limpiarTexto(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,]/g, '');
}

export function normalizarEstado(texto) {
  const e = clave(texto);
  if (e === 'activo') return ok('Activo');
  if (e === 'inactivo') return ok('Inactivo');
  return fallo(`estado "${limpiarTexto(texto)}" no reconocido (debe ser Activo o Inactivo)`);
}

/** El email se guarda en minúsculas y sin espacios. Solo se comprueba la forma básica. */
export function normalizarEmail(texto) {
  const email = String(texto ?? '').trim().toLowerCase();
  if (!email) return fallo('falta el email del contacto');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fallo(`email "${email}" no válido`);
  return ok(email);
}

/** Últimas 9 cifras: sirven para saber si dos teléfonos con distinto formato son el mismo. */
export function claveTelefono(texto) {
  return String(texto ?? '').replace(/\D/g, '').slice(-9);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// --- Fechas ---------------------------------------------------------------

/**
 * Admite d/m/aa, dd/mm/aaaa, dd-mm-aaaa y aaaa-mm-dd. Siempre día/mes/año.
 * Un año de dos cifras se toma como 20xx y se avisa. Una fecha que no existe
 * (31/09) se rechaza: no se corrige.
 * @returns {{ok: true, valor: string, aviso?: string} | {ok: false, error: string}} valor = "AAAA-MM-DD"
 */
export function parsearFecha(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return fallo('falta la fecha');

  let dia, mes, anio, aviso;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    [, anio, mes, dia] = m;
  } else if ((m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/))) {
    [, dia, mes, anio] = m;
    if (anio.length === 2) {
      anio = `20${anio}`;
      aviso = `fecha "${t}" con año de dos cifras: interpretada como ${anio} (día/mes/año)`;
    }
  } else {
    return fallo(`fecha "${t}" con formato no reconocido`);
  }

  const [d, mm, a] = [Number(dia), Number(mes), Number(anio)];
  // Se construye la fecha y se comprueba que no "rebose" (31/09 pasaría a 01/10).
  const fecha = new Date(Date.UTC(a, mm - 1, d));
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== mm - 1 || fecha.getUTCDate() !== d) {
    const diasMes = new Date(Date.UTC(a, mm, 0)).getUTCDate();
    return fallo(mm >= 1 && mm <= 12
      ? `la fecha "${t}" no existe: ${MESES[mm - 1]} de ${a} solo tiene ${diasMes} días`
      : `la fecha "${t}" no existe: el mes debe estar entre 1 y 12`);
  }
  return ok(`${anio}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, aviso);
}

// --- Importes e IVA ---------------------------------------------------------

/**
 * Interpreta un importe en euros. Reglas (un euro tiene como máximo 2 decimales):
 *   - Con coma: la coma es el decimal y los puntos son miles   → "1.875,60" = 1875,60
 *   - Sin coma y punto + exactamente 3 cifras: miles            → "1.250" = 1250
 *   - Sin coma y punto + 1 o 2 cifras: decimal (con aviso)      → "640.5" = 640,50
 *   - Un signo menos delante indica un abono o una rectificativa  → "-1.250,00"
 *   - Cualquier otra cosa se rechaza, no se adivina             → "12,345"
 * @returns {{ok: true, valor: number, aviso?: string} | {ok: false, error: string}} valor en CÉNTIMOS (entero)
 */
export function parsearImporte(texto) {
  let t = String(texto ?? '').replace(/€/g, '').replace(/\s/g, '');
  if (!t) return fallo('falta el importe');
  const negativo = t.startsWith('-');
  if (negativo) t = t.slice(1);

  let normal, aviso;
  if (t.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(t)) return fallo(`importe "${t}" no válido`);
    normal = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, '');
  } else if (/^\d+$/.test(t)) {
    normal = t;
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    normal = t;
    aviso = `importe "${t}" con punto decimal: interpretado como ${Number(t).toFixed(2).replace('.', ',')}`;
  } else {
    return fallo(`importe "${t}" no válido`);
  }
  const centimos = Math.round(Number(normal) * 100);
  return ok(negativo && centimos !== 0 ? -centimos : centimos, aviso);
}

/** Céntimos → "1250.00" (el formato que entiende PostgreSQL). */
export function centimosATexto(centimos) {
  return (centimos / 100).toFixed(2);
}

/** "21%", "21" o "0" → 21. Vacío o fuera de 0–100 se rechaza. */
export function parsearIva(texto) {
  const t = String(texto ?? '').replace(/\s/g, '');
  if (!t) return fallo('falta el IVA');
  const m = t.match(/^(\d{1,3}(?:[.,]\d{1,2})?)%?$/);
  const valor = m ? Number(m[1].replace(',', '.')) : NaN;
  if (Number.isNaN(valor) || valor > 100) return fallo(`IVA "${t}" no válido`);
  return ok(valor);
}
