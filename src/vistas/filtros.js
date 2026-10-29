// Funciones de formato para las plantillas: se usan así  {{ valor | euros }}.

const formatoEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formatoFechaHora = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
});

/** "1875.60" → "1875,60 €" */
export function euros(valor) {
  return valor === null || valor === undefined || valor === '' ? '' : formatoEuros.format(Number(valor));
}

/** "2025-01-14" → "14/01/2025" (se hace con el texto, sin pasar por Date, para evitar desfases de zona horaria). */
export function fecha(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Date → "29/10/2026, 14:05" en hora de Madrid. */
export function fechaHora(valor) {
  return valor ? formatoFechaHora.format(new Date(valor)) : '';
}

const formatoPorcentaje = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** "21.00" → "21 %" */
export function porcentaje(valor) {
  return valor === null || valor === undefined || valor === '' ? '' : `${formatoPorcentaje.format(Number(valor))} %`;
}

// Nombres con los que el histórico guarda cada campo → texto para la persona usuaria.
const ETIQUETAS_CAMPO = {
  empresa: 'Empresa', cif: 'CIF', direccion: 'Dirección', cp: 'Código postal', ciudad: 'Ciudad', pais: 'País',
  estado: 'Estado', fechaAlta: 'Fecha de alta', comercial: 'Comercial', nombre: 'Nombre', email: 'Correo electrónico',
  telefono: 'Teléfono',
};
const ETIQUETAS_ACCION = {
  alta: 'Alta', modificacion: 'Modificación', baja: 'A la papelera', restauracion: 'Restauración', eliminacion: 'Eliminación',
};

export const etiquetaCampo = (campo) => ETIQUETAS_CAMPO[campo] ?? campo;
export const etiquetaAccion = (accion) => ETIQUETAS_ACCION[accion] ?? accion;

export const filtros = { euros, fecha, fechaHora, porcentaje, etiquetaCampo, etiquetaAccion };
