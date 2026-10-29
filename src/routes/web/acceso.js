// Páginas de acceso: formulario de login, entrada y salida.

import { Router } from 'express';
import { ErrorAplicacion } from '../../errores.js';
import { protegerCsrf } from '../../middleware/protegerCsrf.js';
import { leerCookie, nombreCookieSesion, opcionesCookieSesion } from '../../seguridad/cookies.js';

export function rutasAcceso({ autenticacion }, config) {
  const router = Router();
  const cookie = nombreCookieSesion(config);

  router.get('/', (req, res) => res.redirect(303, '/clientes'));

  router.get('/login', (req, res) => res.render('login.njk'));

  router.post('/login', protegerCsrf, async (req, res) => {
    const { email, clave } = req.body ?? {};
    const mostrarError = (estado, error) => res.status(estado).render('login.njk', { error, email: typeof email === 'string' ? email : '' });

    if (typeof email !== 'string' || typeof clave !== 'string' || !email.trim() || !clave
        || email.length > 254 || clave.length > 200) {
      return mostrarError(400, 'Indica tu correo electrónico y tu contraseña.');
    }
    try {
      const sesion = await autenticacion.iniciarSesion({ email: email.trim(), clave, tipo: 'web', origen: req.ip });
      res.cookie(cookie, sesion.token, opcionesCookieSesion(config, sesion.expiraEn));
      res.redirect(303, '/clientes');
    } catch (error) {
      if (error instanceof ErrorAplicacion && [401, 429].includes(error.estado)) return mostrarError(error.estado, error.message);
      throw error;
    }
  });

  router.post('/logout', protegerCsrf, async (req, res) => {
    const token = leerCookie(req.headers.cookie, cookie);
    if (token) await autenticacion.cerrarSesion(token);
    res.clearCookie(cookie, opcionesCookieSesion(config));
    res.redirect(303, '/login');
  });

  return router;
}
