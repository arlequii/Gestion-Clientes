// Decide qué hacer con cada fila del CSV, SIN tocar la base de datos.
//
// Entrada: las filas leídas del CSV. Salida: un "plan" con los clientes,
// contactos y facturas que se crearán y el resultado de cada fila:
//   importada  → se guarda
//   duplicada  → factura idéntica a otra ya aceptada; no se guarda dos veces
//   rechazada  → tiene un dato inválido (fecha imposible, falta la base...)
//   pendiente  → no se puede decidir sola (sin CIF, o mismo nº de factura con datos distintos)
// Nunca se inventa un dato: lo dudoso se rechaza o queda pendiente, y lo
// interpretable pero incierto se acepta con un aviso.

import {
  limpiarTexto, capitalizarSiHaceFalta, clave, normalizarEstado, normalizarEmail,
  claveTelefono, parsearFecha, parsearImporte, parsearIva,
} from './normalizar.js';
import { normalizarPais, normalizarCif, cifTieneFormatoValido, controlEspanolCorrecto } from '../dominio/paises.js';

/**
 * Limpia y valida una fila. No decide duplicados (eso necesita ver otras filas).
 * @returns {{ errores: string[], avisos: string[], avisoCif: string|null, sinCif: boolean, baseCentimos: number|null,
 *             cliente: object, contacto: object, factura: object|null }}
 */
function analizarFila(d) {
  const errores = [];
  const avisos = [];
  // Recoge el resultado de un normalizador: guarda errores y avisos, devuelve el valor.
  const tomar = (resultado) => {
    if (!resultado.ok) { errores.push(resultado.error); return null; }
    if (resultado.aviso) avisos.push(resultado.aviso);
    return resultado.valor;
  };

  const empresa = limpiarTexto(d.empresa);
  if (!empresa) errores.push('falta la empresa');

  const pais = normalizarPais(d.pais);
  if (!pais) errores.push(`país "${limpiarTexto(d.pais)}" no reconocido`);

  const cif = normalizarCif(d.cif);
  let avisoCif = null; // se muestra una vez por cliente, no en cada una de sus filas
  if (cif && pais) {
    if (!cifTieneFormatoValido(cif, pais)) {
      errores.push(`CIF/NIF "${limpiarTexto(d.cif)}" no válido para ${pais}`);
    } else if (pais === 'España' && !controlEspanolCorrecto(cif)) {
      avisoCif = `el dígito de control del CIF ${cif} no es correcto`;
    }
  }

  const nombreContacto = limpiarTexto(d.contacto);
  if (!nombreContacto) errores.push('falta el nombre del contacto');
  const email = tomar(normalizarEmail(d.email));

  const estado = tomar(normalizarEstado(d.estado));
  const fechaAlta = tomar(parsearFecha(d.fecha_alta));

  // Factura: si los cuatro campos están vacíos la fila solo describe al cliente.
  const camposFactura = [d.factura, d.fecha_factura, d.base_imponible, d.iva];
  const hayFactura = camposFactura.some((c) => limpiarTexto(c) !== '');
  let factura = null;
  let baseCentimos = null;

  if (hayFactura) {
    const numero = limpiarTexto(d.factura);
    if (!numero) errores.push('falta el número de factura');
    const fecha = tomar(parsearFecha(d.fecha_factura));
    const base = tomar(parsearImporte(d.base_imponible));
    const iva = tomar(parsearIva(d.iva));
    baseCentimos = base; // se guarda aunque la fila falle, para el informe de cuadre
    factura = { numero, fecha, baseCentimos: base, iva };
  }

  return {
    errores, avisos, avisoCif, sinCif: cif === '', baseCentimos, factura,
    cliente: {
      cif, empresa, pais, estado, fechaAlta,
      direccion: limpiarTexto(d.direccion) || null,
      cp: limpiarTexto(d.cp) || null,
      ciudad: capitalizarSiHaceFalta(d.ciudad) || null,
      comercial: capitalizarSiHaceFalta(d.comercial) || null,
    },
    contacto: { nombre: nombreContacto, email, telefono: limpiarTexto(d.telefono) || null },
  };
}

/** Dos facturas con el mismo número son "la misma" si coinciden todos sus datos. */
function mismaFactura(a, b) {
  return a.cliente.cif === b.cliente.cif && a.factura.fecha === b.factura.fecha
    && a.factura.baseCentimos === b.factura.baseCentimos && a.factura.iva === b.factura.iva;
}

/**
 * @param {{ numeroFila: number, datos: Record<string,string> }[]} filasCsv
 * @returns {{ clientes: object[], filas: object[] }}
 */
export function planificar(filasCsv) {
  // Paso 1: analizar cada fila y marcar las rechazadas y las pendientes por falta de CIF.
  const filas = filasCsv.map(({ numeroFila, datos }) => {
    const analisis = analizarFila(datos);
    const fila = {
      numeroFila, analisis, datosOriginales: datos, avisos: analisis.avisos,
      baseCentimos: analisis.baseCentimos, resultado: 'importada', motivo: null,
    };
    if (analisis.errores.length > 0) {
      fila.resultado = 'rechazada';
      fila.motivo = analisis.errores.join('; ');
    } else if (analisis.sinCif) {
      fila.resultado = 'pendiente';
      fila.motivo = 'Sin CIF: no se fusiona automáticamente con ningún cliente; requiere revisión';
    }
    return fila;
  });

  // Paso 2: facturas con el mismo número entre las filas que siguen aceptadas.
  const porNumero = new Map();
  for (const fila of filas) {
    if (fila.resultado !== 'importada' || !fila.analisis.factura) continue;
    const lista = porNumero.get(fila.analisis.factura.numero) ?? [];
    lista.push(fila);
    porNumero.set(fila.analisis.factura.numero, lista);
  }
  for (const [numero, lista] of porNumero) {
    if (lista.length < 2) continue;
    const [primera, ...resto] = lista;
    if (lista.every((f) => mismaFactura(primera.analisis, f.analisis))) {
      for (const f of resto) {
        f.resultado = 'duplicada';
        f.motivo = `Factura ${numero} idéntica a la de la fila ${primera.numeroFila}`;
      }
    } else {
      // Mismo número pero datos distintos: no se sabe cuál es la buena, así que no se importa ninguna.
      const donde = lista.map((f) => f.numeroFila).join(', ');
      for (const f of lista) {
        f.resultado = 'pendiente';
        f.motivo = `La factura ${numero} aparece con datos distintos en las filas ${donde}`;
      }
    }
  }

  // Paso 3: agrupar las filas importadas por CIF. La primera fija los datos del cliente.
  const clientes = new Map();
  for (const fila of filas.filter((f) => f.resultado === 'importada')) {
    const { cliente, contacto, factura } = fila.analisis;
    let plan = clientes.get(cliente.cif);

    if (!plan) {
      plan = { ...cliente, contactos: [], facturas: [], filaOrigen: fila.numeroFila };
      if (fila.analisis.avisoCif) fila.avisos.push(fila.analisis.avisoCif);
      clientes.set(cliente.cif, plan);
    } else {
      avisarDiferencias(fila, plan, cliente);
    }

    const existente = plan.contactos.find((c) => c.email === contacto.email);
    if (!existente) {
      plan.contactos.push({ ...contacto });
    } else if (claveTelefono(existente.telefono) !== claveTelefono(contacto.telefono)) {
      fila.avisos.push(`el teléfono de ${contacto.email} difiere del de otra fila; se mantiene el primero`);
    }

    if (factura) plan.facturas.push({ ...factura, filaOrigen: fila.numeroFila });
  }

  return { clientes: [...clientes.values()], filas };
}

/** Si una fila repite un cliente con datos distintos, se mantiene el primero y se deja un aviso. */
function avisarDiferencias(fila, plan, nuevo) {
  const campos = [
    ['empresa', 'nombre de la empresa', clave],
    ['pais', 'país', clave],
    ['estado', 'estado', clave],
    ['comercial', 'comercial', clave],
    ['fechaAlta', 'fecha de alta', (v) => v],
  ];
  for (const [campo, etiqueta, normalizar] of campos) {
    if (normalizar(plan[campo] ?? '') !== normalizar(nuevo[campo] ?? '')) {
      fila.avisos.push(`${etiqueta} distinto del de la primera fila de este cliente ("${nuevo[campo]}" frente a "${plan[campo]}"); se mantiene el primero`);
    }
  }
}
