// Página de ayuda para quien usa la aplicación (sin conocimientos técnicos).

import { Router } from 'express';

export function rutasAyuda() {
  const router = Router();
  router.get('/ayuda', (req, res) => res.render('ayuda.njk', { seccion: 'ayuda' }));
  return router;
}
