// Reglas de validación de clientes y contactos.
//
// Las usa el servicio, así que valen igual para la API y para los
// formularios de la web. Reutilizan los normalizadores del importador: un
// email o un CIF se limpian igual venga de un CSV o de un formulario.

import { Errores, exigirObjeto, leerTexto, enteroPositivo } from './entrada.js';
import { normalizarEmail, normalizarEstado, parsearFecha } from '../importacion/normalizar.js';
import { normalizarPais, normalizarCif, cifTieneFormatoValido, controlEspanolCorrecto, NOMBRES_PAISES } from '../dominio/paises.js';

export const ESTADOS = ['Activo', 'Inactivo'];

/**
 * Valida los datos de un cliente.
 * @param {object} entrada lo recibido (JSON o formulario)
 * @param {{ crear: boolean, actual?: object }} opciones
 *   crear=true: los campos obligatorios deben venir. crear=false (edición): solo se validan los enviados.
 *   `actual` es el cliente guardado; hace falta para validar el CIF contra el país cuando solo cambia uno.
 * @returns {{ datos: object, avisos: string[] }} datos limpios (solo los enviados) y avisos no bloqueantes
 * @throws {ErrorAplicacion} 400 con los errores por campo
 */
export function validarCliente(entrada, { crear, actual = null }) {
  exigirObjeto(entrada);
  const errores = new Errores();
  const avisos = [];
  const datos = {};
  const poner = (campo, valor) => { if (valor !== undefined) datos[campo] = valor; };

  poner('empresa', leerTexto(entrada, 'empresa', errores, { obligatorio: true, max: 200 }));
  poner('direccion', leerTexto(entrada, 'direccion', errores, { max: 200 }));
  poner('cp', leerTexto(entrada, 'cp', errores, { max: 12 }));
  poner('ciudad', leerTexto(entrada, 'ciudad', errores, { max: 100 }));

  // País (acepta "Spain", "ESPAÑA"... y lo convierte al nombre oficial).
  if (entrada.pais !== undefined) {
    const pais = normalizarPais(entrada.pais);
    if (pais) datos.pais = pais;
    else errores.agregar('pais', `El país debe ser uno de: ${NOMBRES_PAISES.join(', ')}`);
  }

  // CIF: se limpia y se comprueba contra el país que va a tener el cliente.
  const cifTexto = leerTexto(entrada, 'cif', errores, { obligatorio: true, max: 30 });
  if (cifTexto) datos.cif = normalizarCif(cifTexto);

  if (entrada.estado !== undefined) {
    const estado = normalizarEstado(entrada.estado);
    if (estado.ok) datos.estado = estado.valor;
    else errores.agregar('estado', `El estado debe ser ${ESTADOS.join(' o ')}`);
  }

  if (entrada.fechaAlta !== undefined) {
    const fecha = typeof entrada.fechaAlta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entrada.fechaAlta)
      ? parsearFecha(entrada.fechaAlta) : { ok: false };
    if (fecha.ok) datos.fechaAlta = fecha.valor;
    else errores.agregar('fechaAlta', 'La fecha de alta debe tener el formato AAAA-MM-DD y existir');
  }

  // Comercial: un id, o null/"" para dejarlo sin asignar. Que exista lo comprueba el servicio.
  if (entrada.comercialId !== undefined) {
    if (entrada.comercialId === null || entrada.comercialId === '') datos.comercialId = null;
    else if (enteroPositivo(entrada.comercialId)) datos.comercialId = enteroPositivo(entrada.comercialId);
    else errores.agregar('comercialId', 'El comercial no es válido');
  }

  // Obligatorios al crear (en la edición, solo si se enviaron vacíos).
  if (crear) {
    for (const campo of ['empresa', 'cif', 'pais']) {
      if (datos[campo] === undefined) errores.agregar(campo, 'Campo obligatorio');
    }
  }

  // CIF contra país (solo si alguno de los dos cambia).
  const pais = datos.pais ?? actual?.pais;
  const cif = datos.cif ?? actual?.cif;
  if ((datos.cif !== undefined || datos.pais !== undefined) && pais && cif && !errores.campos.cif && !errores.campos.pais) {
    if (!cifTieneFormatoValido(cif, pais)) {
      errores.agregar('cif', `El CIF/NIF/IVA "${cif}" no tiene un formato válido para ${pais}`);
    } else if (pais === 'España' && !controlEspanolCorrecto(cif)) {
      avisos.push(`El dígito de control del CIF ${cif} no parece correcto; revísalo.`);
    }
  }

  errores.lanzarSiHay();
  return { datos, avisos };
}

/** Valida los datos de un contacto (mismas reglas de `crear` que en el cliente). */
export function validarContacto(entrada, { crear }) {
  exigirObjeto(entrada);
  const errores = new Errores();
  const datos = {};

  const nombre = leerTexto(entrada, 'nombre', errores, { obligatorio: true, max: 150 });
  if (nombre !== undefined) datos.nombre = nombre;
  if (crear && datos.nombre === undefined) errores.agregar('nombre', 'Campo obligatorio');

  if (entrada.email !== undefined || crear) {
    const email = typeof entrada.email === 'string' && entrada.email.length <= 254
      ? normalizarEmail(entrada.email) : { ok: false, error: 'falta el email o supera los 254 caracteres' };
    if (email.ok) datos.email = email.valor;
    else errores.agregar('email', email.error.charAt(0).toUpperCase() + email.error.slice(1));
  }

  const telefono = leerTexto(entrada, 'telefono', errores, { max: 30 });
  if (telefono !== undefined) {
    if (telefono !== null && (!/^[+\d\s().-]+$/.test(telefono) || telefono.replace(/\D/g, '').length < 6)) {
      errores.agregar('telefono', 'El teléfono solo puede llevar cifras, espacios, +, -, ( y ), y al menos 6 cifras');
    } else {
      datos.telefono = telefono;
    }
  }

  errores.lanzarSiHay();
  return { datos };
}

const ORDENES = ['empresa', 'ciudad', 'pais', 'estado', 'fechaAlta', 'modificadoEn', 'facturacion'];

/**
 * Valida los parámetros del listado (query string).
 * @returns {{ q?: string, estado?: string, pais?: string, comercialId?: number, eliminados: boolean, orden: string, direccion: 'asc'|'desc' }}
 */
export function validarFiltros(query) {
  const errores = new Errores();
  const filtros = { eliminados: query.eliminados === 'true', orden: 'empresa', direccion: 'asc' };

  if (typeof query.q === 'string' && query.q.trim() !== '') {
    if (query.q.length > 100) errores.agregar('q', 'La búsqueda no puede superar los 100 caracteres');
    else filtros.q = query.q.trim();
  }
  if (query.estado) {
    const estado = normalizarEstado(String(query.estado));
    if (estado.ok) filtros.estado = estado.valor; else errores.agregar('estado', `El estado debe ser ${ESTADOS.join(' o ')}`);
  }
  if (query.pais) {
    const pais = normalizarPais(String(query.pais));
    if (pais) filtros.pais = pais; else errores.agregar('pais', 'País no reconocido');
  }
  if (query.comercial) {
    if (enteroPositivo(String(query.comercial))) filtros.comercialId = enteroPositivo(String(query.comercial));
    else errores.agregar('comercial', 'El comercial debe ser un id numérico');
  }
  if (query.orden) {
    if (ORDENES.includes(query.orden)) filtros.orden = query.orden;
    else errores.agregar('orden', `El orden debe ser uno de: ${ORDENES.join(', ')}`);
  }
  if (query.direccion) {
    if (['asc', 'desc'].includes(query.direccion)) filtros.direccion = query.direccion;
    else errores.agregar('direccion', 'La dirección debe ser asc o desc');
  }

  errores.lanzarSiHay();
  return filtros;
}
