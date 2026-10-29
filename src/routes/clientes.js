// Rutas REST de clientes y contactos. Son "finas": leen la petición, llaman al
// servicio y responden. Las reglas viven en el servicio y la validación en /validacion.
// Todas cuelgan de /api, que ya exige token (ver app.js), así que `req.usuario` existe siempre.

import { Router } from 'express';
import { leerId } from '../validacion/entrada.js';

export function rutasClientes({ clientes }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await clientes.listar(req.query));
  });

  router.post('/', async (req, res) => {
    const { cliente, avisos } = await clientes.crear(req.body, req.usuario);
    res.status(201).location(`/api/clientes/${cliente.id}`).json({ ...cliente, avisos });
  });

  router.get('/:id', async (req, res) => {
    res.json(await clientes.obtener(leerId(req.params.id)));
  });

  router.put('/:id', async (req, res) => {
    const { cliente, avisos } = await clientes.actualizar(leerId(req.params.id), req.body, req.usuario);
    res.json({ ...cliente, avisos });
  });

  router.delete('/:id', async (req, res) => {
    await clientes.eliminar(leerId(req.params.id), req.usuario);
    res.status(204).end();
  });

  router.post('/:id/restaurar', async (req, res) => {
    res.json(await clientes.restaurar(leerId(req.params.id), req.usuario));
  });

  router.get('/:id/historico', async (req, res) => {
    res.json(await clientes.historico(leerId(req.params.id), req.query));
  });

  // Contactos del cliente
  router.post('/:id/contactos', async (req, res) => {
    const contacto = await clientes.crearContacto(leerId(req.params.id), req.body, req.usuario);
    res.status(201).json(contacto);
  });

  router.put('/:id/contactos/:contactoId', async (req, res) => {
    res.json(await clientes.actualizarContacto(leerId(req.params.id), leerId(req.params.contactoId), req.body, req.usuario));
  });

  router.delete('/:id/contactos/:contactoId', async (req, res) => {
    await clientes.eliminarContacto(leerId(req.params.id), leerId(req.params.contactoId), req.usuario);
    res.status(204).end();
  });

  return router;
}

/** Listas para rellenar filtros y formularios. */
export function rutasCatalogos({ clientes }, paises) {
  const router = Router();
  router.get('/comerciales', async (req, res) => res.json({ datos: await clientes.comerciales() }));
  router.get('/paises', (req, res) => res.json({ datos: paises }));
  return router;
}
