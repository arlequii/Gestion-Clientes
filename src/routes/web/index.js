// Todas las rutas de la web (las páginas, no la API).

import { Router } from 'express';
import { autenticarWeb } from '../../middleware/autenticarWeb.js';
import { rutasAcceso } from './acceso.js';
import { rutasClientesWeb } from './clientes.js';
import { rutasFichasWeb } from './fichas.js';
import { rutasAyuda } from './ayuda.js';

export function rutasWeb(servicios, config) {
  const router = Router();
  router.use(rutasAcceso(servicios, config)); // públicas: login y logout
  router.use(autenticarWeb(servicios.autenticacion, config)); // todo lo siguiente exige sesión
  router.use(rutasClientesWeb(servicios));
  router.use(rutasFichasWeb(servicios));
  router.use(rutasAyuda());
  return router;
}
