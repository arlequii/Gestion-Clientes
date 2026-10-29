// Páginas de un cliente: ficha, alta, edición, papelera/restauración y contactos.
//
// Las rutas no tienen lógica de negocio: traducen el formulario a los datos
// que espera el servicio (el mismo que usa la API), llaman al servicio y
// deciden qué página mostrar. Tras guardar se redirige (patrón "enviar y
// redirigir") para que recargar la página no repita el envío.

import { Router } from 'express';
import { ErrorAplicacion } from '../../errores.js';
import { leerId, enteroPositivo } from '../../validacion/entrada.js';
import { ESTADOS } from '../../validacion/cliente.js';
import { NOMBRES_PAISES, normalizarCif, controlEspanolCorrecto } from '../../dominio/paises.js';
import { protegerCsrf } from '../../middleware/protegerCsrf.js';

// Mensajes que puede mostrar la ficha tras una acción. Se piden por clave
// (?ok=creado) y nunca se muestra texto que venga de la dirección.
const MENSAJES_OK = {
  creado: 'Cliente creado correctamente.',
  guardado: 'Los cambios se han guardado.',
  baja: 'El cliente está ahora en la papelera. Puedes restaurarlo cuando quieras.',
  restaurado: 'El cliente se ha restaurado.',
  'contacto-creado': 'Contacto añadido.',
  'contacto-guardado': 'Contacto actualizado.',
  'contacto-eliminado': 'Contacto eliminado.',
};
const MENSAJES_ERROR = {
  confirmacion: 'El CIF escrito no coincide, así que el cliente no se ha movido a la papelera.',
  conflicto: 'No se ha podido realizar la acción. Recuerda que un cliente en la papelera no se puede modificar y que debe conservar al menos un contacto.',
};

const texto = (valor) => (typeof valor === 'string' ? valor : '');

/** Fecha de hoy (AAAA-MM-DD) en hora de Madrid, para rellenar la fecha de alta. */
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Los campos del formulario de cliente, en el formato que espera el servicio. */
function entradaCliente(cuerpo, { conContacto }) {
  const entrada = {
    empresa: texto(cuerpo.empresa), cif: texto(cuerpo.cif), direccion: texto(cuerpo.direccion), cp: texto(cuerpo.cp),
    ciudad: texto(cuerpo.ciudad), pais: texto(cuerpo.pais), estado: texto(cuerpo.estado),
    comercialId: texto(cuerpo.comercialId),
  };
  if (texto(cuerpo.fechaAlta)) entrada.fechaAlta = texto(cuerpo.fechaAlta);
  if (conContacto) {
    entrada.contactos = [{
      nombre: texto(cuerpo.contactoNombre), email: texto(cuerpo.contactoEmail), telefono: texto(cuerpo.contactoTelefono),
    }];
  }
  return entrada;
}

const entradaContacto = (cuerpo) => ({ nombre: texto(cuerpo.nombre), email: texto(cuerpo.email), telefono: texto(cuerpo.telefono) });

/** "contactos.0.email" (nombre en la API) → "contactoEmail" (nombre del campo en el formulario). */
function detallesParaFormulario(detalles = {}) {
  const resultado = {};
  for (const [clave, mensaje] of Object.entries(detalles)) {
    const m = /^contactos\.0\.(\w+)$/.exec(clave);
    resultado[m ? `contacto${m[1][0].toUpperCase()}${m[1].slice(1)}` : clave] = mensaje;
  }
  return resultado;
}

/** Valores iniciales del formulario de edición, a partir del cliente guardado. */
const valoresDeCliente = (c) => ({
  empresa: c.empresa, cif: c.cif, direccion: c.direccion, cp: c.cp, ciudad: c.ciudad, pais: c.pais, estado: c.estado,
  fechaAlta: c.fechaAlta, comercialId: c.comercial?.id ?? '',
});

/** Un fallo de validación o de conflicto se vuelve a mostrar en el formulario; cualquier otro, a la página de error. */
function esErrorDeFormulario(error) {
  return error instanceof ErrorAplicacion && [400, 409].includes(error.estado);
}

export function rutasFichasWeb({ clientes }) {
  const router = Router();
  router.use(protegerCsrf); // no afecta a las páginas que solo se consultan (GET)

  const contextoFormulario = async (extra) => ({
    seccion: 'clientes', estados: ESTADOS, paises: NOMBRES_PAISES, comerciales: await clientes.comerciales(), errores: {}, ...extra,
  });

  // ---------- Alta ----------
  // (Va antes de /clientes/:id para que "nuevo" no se interprete como un id.)
  router.get('/clientes/nuevo', async (req, res) => {
    res.render('clientes/formulario.njk', await contextoFormulario({
      modo: 'crear', accion: '/clientes', valores: { estado: 'Activo', pais: 'España', fechaAlta: hoy() },
    }));
  });

  router.post('/clientes', async (req, res) => {
    const valores = req.body ?? {};
    try {
      const { cliente } = await clientes.crear(entradaCliente(valores, { conContacto: true }), req.usuario);
      res.redirect(303, `/clientes/${cliente.id}?ok=creado`);
    } catch (error) {
      if (!esErrorDeFormulario(error)) throw error;
      res.status(error.estado).render('clientes/formulario.njk', await contextoFormulario({
        modo: 'crear', accion: '/clientes', valores,
        errores: detallesParaFormulario(error.detalles), errorGeneral: error.detalles ? null : error.message,
      }));
    }
  });

  // ---------- Papelera: uno o varios clientes a la vez ----------
  // Sirve al botón de cada fila, a la selección múltiple del listado y a "Restaurar".
  // Va antes de /clientes/:id para que "lote" no se interprete como un id.
  router.post('/clientes/lote', async (req, res) => {
    const accion = texto(req.body?.accion);
    if (!['papelera', 'restaurar'].includes(accion)) throw new ErrorAplicacion(400, 'Acción no válida');

    // Con un solo "ids" llega un texto y con varios una lista; se admite todo y se descarta lo que no sea un id.
    const ids = [].concat(req.body?.ids ?? []).map(enteroPositivo).filter((id) => id !== null);
    // Se vuelve al listado: a la papelera tras restaurar (por si quedan más) y a Clientes tras eliminar.
    const volver = (extra) => `/clientes?${new URLSearchParams({ ...(accion === 'restaurar' ? { eliminados: 'true' } : {}), ...extra })}`;
    if (ids.length === 0) return res.redirect(303, volver({ error: 'seleccion' }));

    const { cambiados } = accion === 'restaurar'
      ? await clientes.restaurarVarios(ids, req.usuario)
      : await clientes.eliminarVarios(ids, req.usuario);
    res.redirect(303, volver({ ok: accion === 'restaurar' ? 'restaurados' : 'papelera', n: cambiados }));
  });

  // ---------- Ficha ----------
  router.get('/clientes/:id', async (req, res) => {
    const id = leerId(req.params.id);
    const cliente = await clientes.obtener(id);

    let historico;
    try {
      historico = await clientes.historico(id, { pagina: typeof req.query.hpagina === 'string' ? req.query.hpagina : undefined });
    } catch (error) {
      if (!(error instanceof ErrorAplicacion) || error.estado !== 400) throw error;
      historico = await clientes.historico(id, {}); // página del histórico no válida: se muestra la primera
    }

    res.render('clientes/ficha.njk', {
      seccion: 'clientes', cliente, historico: historico.datos, paginacionHistorico: historico.paginacion,
      // Pestaña que se abre: la del histórico si se está navegando por sus páginas; si no, Contactos.
      pestana: typeof req.query.hpagina === 'string' ? 'historico' : 'contactos',
      urlHistorico: (n) => `/clientes/${id}?hpagina=${n}`,
      // El dígito de control del CIF español es solo un aviso, nunca un bloqueo.
      avisoControl: cliente.pais === 'España' && !controlEspanolCorrecto(cliente.cif),
      mensajeOk: MENSAJES_OK[req.query.ok], mensajeError: MENSAJES_ERROR[req.query.error],
    });
  });

  // ---------- Edición ----------
  router.get('/clientes/:id/editar', async (req, res) => {
    const id = leerId(req.params.id);
    const cliente = await clientes.obtener(id);
    if (cliente.eliminadoEn) return res.redirect(303, `/clientes/${id}`); // en la papelera: primero se restaura
    res.render('clientes/formulario.njk', await contextoFormulario({
      modo: 'editar', accion: `/clientes/${id}`, cliente, valores: valoresDeCliente(cliente),
    }));
  });

  router.post('/clientes/:id', async (req, res) => {
    const id = leerId(req.params.id);
    const valores = req.body ?? {};
    try {
      await clientes.actualizar(id, entradaCliente(valores, { conContacto: false }), req.usuario);
      res.redirect(303, `/clientes/${id}?ok=guardado`);
    } catch (error) {
      if (!esErrorDeFormulario(error)) throw error;
      res.status(error.estado).render('clientes/formulario.njk', await contextoFormulario({
        modo: 'editar', accion: `/clientes/${id}`, cliente: await clientes.obtener(id), valores,
        errores: detallesParaFormulario(error.detalles), errorGeneral: error.detalles ? null : error.message,
      }));
    }
  });

  // ---------- Papelera desde la ficha (con doble verificación) y restauración ----------
  // Primera verificación: el botón abre una ventana de confirmación.
  // Segunda: hay que escribir el CIF del cliente. Aquí se vuelve a comprobar,
  // porque el navegador no es de fiar (puede no tener JavaScript o ser un envío manual).
  router.post('/clientes/:id/baja', async (req, res) => {
    const id = leerId(req.params.id);
    const cliente = await clientes.obtener(id);
    if (normalizarCif(texto(req.body?.confirmacion)) !== cliente.cif) {
      return res.redirect(303, `/clientes/${id}?error=confirmacion`);
    }
    await clientes.eliminar(id, req.usuario);
    res.redirect(303, `/clientes/${id}?ok=baja`);
  });

  router.post('/clientes/:id/restaurar', async (req, res) => {
    const id = leerId(req.params.id);
    await clientes.restaurar(id, req.usuario);
    res.redirect(303, `/clientes/${id}?ok=restaurado`);
  });

  // ---------- Contactos ----------
  const contextoContacto = async (id, extra) => {
    const cliente = await clientes.obtener(id);
    return { seccion: 'clientes', cliente, errores: {}, ...extra };
  };

  router.get('/clientes/:id/contactos/nuevo', async (req, res) => {
    const id = leerId(req.params.id);
    const contexto = await contextoContacto(id, { modo: 'crear', accion: `/clientes/${id}/contactos`, valores: {} });
    if (contexto.cliente.eliminadoEn) return res.redirect(303, `/clientes/${id}`);
    res.render('contactos/formulario.njk', contexto);
  });

  router.post('/clientes/:id/contactos', async (req, res) => {
    const id = leerId(req.params.id);
    const valores = req.body ?? {};
    try {
      await clientes.crearContacto(id, entradaContacto(valores), req.usuario);
      res.redirect(303, `/clientes/${id}?ok=contacto-creado#contactos`);
    } catch (error) {
      if (!esErrorDeFormulario(error)) throw error;
      res.status(error.estado).render('contactos/formulario.njk', await contextoContacto(id, {
        modo: 'crear', accion: `/clientes/${id}/contactos`, valores,
        errores: error.detalles ?? {}, errorGeneral: error.detalles ? null : error.message,
      }));
    }
  });

  router.get('/clientes/:id/contactos/:contactoId/editar', async (req, res) => {
    const id = leerId(req.params.id);
    const contactoId = leerId(req.params.contactoId);
    const contexto = await contextoContacto(id, { modo: 'editar', accion: `/clientes/${id}/contactos/${contactoId}` });
    if (contexto.cliente.eliminadoEn) return res.redirect(303, `/clientes/${id}`);
    const contacto = contexto.cliente.contactos.find((c) => c.id === contactoId);
    if (!contacto) throw new ErrorAplicacion(404, 'Contacto no encontrado');
    res.render('contactos/formulario.njk', { ...contexto, valores: contacto });
  });

  router.post('/clientes/:id/contactos/:contactoId', async (req, res) => {
    const id = leerId(req.params.id);
    const contactoId = leerId(req.params.contactoId);
    const valores = req.body ?? {};
    try {
      await clientes.actualizarContacto(id, contactoId, entradaContacto(valores), req.usuario);
      res.redirect(303, `/clientes/${id}?ok=contacto-guardado#contactos`);
    } catch (error) {
      if (!esErrorDeFormulario(error)) throw error;
      res.status(error.estado).render('contactos/formulario.njk', await contextoContacto(id, {
        modo: 'editar', accion: `/clientes/${id}/contactos/${contactoId}`, valores,
        errores: error.detalles ?? {}, errorGeneral: error.detalles ? null : error.message,
      }));
    }
  });

  router.post('/clientes/:id/contactos/:contactoId/eliminar', async (req, res) => {
    const id = leerId(req.params.id);
    const contactoId = leerId(req.params.contactoId);
    try {
      await clientes.eliminarContacto(id, contactoId, req.usuario);
      res.redirect(303, `/clientes/${id}?ok=contacto-eliminado#contactos`);
    } catch (error) {
      if (!(error instanceof ErrorAplicacion) || error.estado !== 409) throw error;
      res.redirect(303, `/clientes/${id}?error=conflicto#contactos`);
    }
  });

  return router;
}
