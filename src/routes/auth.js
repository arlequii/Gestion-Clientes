// Rutas de acceso a la API.
//   POST /api/auth/login   { "email": "...", "clave": "..." }  → { token, expiraEn, usuario }
//   POST /api/auth/logout  (con token)                         → 204, el token deja de valer
//   GET  /api/auth/yo      (con token)                         → { usuario }

import { Router } from 'express';
import { ErrorAplicacion } from '../errores.js';
import { autenticarApi } from '../middleware/autenticarApi.js';

export function rutasAuth({ autenticacion }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, clave } = req.body ?? {};
    // Se comprueba el tipo y el tamaño antes de nada: nada de objetos ni textos enormes.
    if (typeof email !== 'string' || typeof clave !== 'string' || !email || !clave
        || email.length > 254 || clave.length > 200) {
      throw new ErrorAplicacion(400, 'Indica el email y la contraseña (como texto)');
    }
    const sesion = await autenticacion.iniciarSesion({ email: email.trim(), clave, tipo: 'api', origen: req.ip });
    res.json(sesion);
  });

  router.post('/logout', autenticarApi(autenticacion), async (req, res) => {
    await autenticacion.cerrarSesion(req.token);
    res.status(204).end();
  });

  router.get('/yo', autenticarApi(autenticacion), (req, res) => {
    res.json({ usuario: req.usuario });
  });

  return router;
}
