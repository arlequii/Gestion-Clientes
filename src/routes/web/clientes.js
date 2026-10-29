// Páginas de clientes: listado con búsqueda, filtros, orden y paginación.
//
// Con JavaScript, htmx pide la misma URL y pinta solo la tabla (fragmento);
// sin JavaScript, o al abrir/recargar la URL, se devuelve la página completa.
// Como la URL siempre refleja los filtros, se puede copiar, recargar o volver atrás.

import { Router } from 'express';
import { ErrorAplicacion } from '../../errores.js';
import { NOMBRES_PAISES } from '../../dominio/paises.js';
import { ESTADOS } from '../../validacion/cliente.js';

const PARAMETROS = ['q', 'estado', 'pais', 'comercial', 'eliminados', 'orden', 'direccion', 'porPagina', 'pagina'];

/** Copia solo los parámetros conocidos y solo si son texto (ignora ?q=a&q=b y similares). */
function leerConsulta(query) {
  const consulta = {};
  for (const nombre of PARAMETROS) {
    if (typeof query[nombre] === 'string' && query[nombre] !== '') consulta[nombre] = query[nombre];
  }
  return consulta;
}

/** "/clientes?q=ebro&pagina=2" a partir de la consulta actual y unos cambios. */
export function construirUrl(consulta, cambios = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...consulta, ...cambios })) {
    if (valor !== undefined && valor !== null && valor !== '') parametros.append(clave, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `/clientes?${texto}` : '/clientes';
}

/**
 * Mensajes que puede mostrar el listado tras una acción sobre clientes.
 * Se piden por clave y número (?ok=papelera&n=3): nunca se muestra texto que venga de la dirección.
 */
function mensajesDeLista(query) {
  const n = typeof query.n === 'string' && /^\d{1,4}$/.test(query.n) ? Number(query.n) : null;
  const clientes = n === 1 ? '1 cliente' : `${n} clientes`;
  const plural = n === 1 ? '' : 's';
  let mensajeOk;
  if (n === 0 && ['papelera', 'restaurados'].includes(query.ok)) {
    mensajeOk = 'No se ha cambiado ningún cliente: ya estaban en ese estado.';
  } else if (n !== null && query.ok === 'papelera') {
    mensajeOk = `${clientes} movido${plural} a la papelera. Puedes restaurar${n === 1 ? 'lo' : 'los'} desde la pestaña Papelera.`;
  } else if (n !== null && query.ok === 'restaurados') {
    mensajeOk = `${clientes} restaurado${plural}.`;
  }
  const mensajeError = query.error === 'seleccion' ? 'Selecciona al menos un cliente.' : undefined;
  return { mensajeOk, mensajeError };
}

/** Números de página a mostrar: la actual y dos a cada lado. */
function paginasVisibles({ pagina, totalPaginas }) {
  const desde = Math.max(1, pagina - 2);
  const hasta = Math.min(totalPaginas, pagina + 2);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

export function rutasClientesWeb({ clientes }) {
  const router = Router();

  router.get('/clientes', async (req, res) => {
    // htmx pide solo el fragmento; salvo al volver atrás en el navegador, que necesita la página entera.
    const fragmento = req.get('HX-Request') === 'true' && req.get('HX-History-Restore-Request') !== 'true';
    res.set('Vary', 'HX-Request, HX-History-Restore-Request');

    let consulta = leerConsulta(req.query);
    let resultado;
    let errorFiltros = null;
    try {
      resultado = await clientes.listar(consulta);
    } catch (error) {
      if (!(error instanceof ErrorAplicacion) || error.estado !== 400) throw error;
      errorFiltros = 'Algún filtro de la dirección no era válido y se ha ignorado.';
      consulta = {};
      resultado = await clientes.listar({});
    }

    const { datos, paginacion } = resultado;
    const enPapelera = consulta.eliminados === 'true';
    const contexto = {
      seccion: 'clientes', datos, paginacion, filtros: consulta, errorFiltros, enPapelera,
      // Pestañas Clientes | Papelera (conservan la búsqueda y los filtros) y el enlace "Limpiar".
      urlPestana: (papelera) => construirUrl(consulta, { eliminados: papelera ? 'true' : undefined, pagina: undefined }),
      urlLimpiar: enPapelera ? '/clientes?eliminados=true' : '/clientes',
      desde: datos.length ? (paginacion.pagina - 1) * paginacion.porPagina + 1 : 0,
      hasta: (paginacion.pagina - 1) * paginacion.porPagina + datos.length,
      paginasVisibles: paginasVisibles(paginacion),
      urlPagina: (n) => construirUrl(consulta, { pagina: n }),
      // Al pulsar una columna: si ya ordenaba por ella se invierte el sentido; si no, ascendente.
      urlOrden: (columna) => {
        const actual = consulta.orden ?? 'empresa';
        const invertir = actual === columna && (consulta.direccion ?? 'asc') === 'asc';
        return construirUrl(consulta, { orden: columna, direccion: invertir ? 'desc' : 'asc', pagina: undefined });
      },
    };

    if (fragmento) {
      // La URL que htmx deja en la barra de direcciones: la limpia (sin parámetros vacíos).
      res.set('HX-Push-Url', construirUrl(consulta));
      return res.render('clientes/_resultado.njk', contexto);
    }
    res.render('clientes/listado.njk', {
      ...contexto, estados: ESTADOS, paises: NOMBRES_PAISES, comerciales: await clientes.comerciales(),
      totalPapelera: await clientes.contarPapelera(), ...mensajesDeLista(req.query),
    });
  });

  return router;
}
