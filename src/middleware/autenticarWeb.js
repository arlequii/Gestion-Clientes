// Protege las páginas web: exige la cookie de sesión. Si no hay sesión válida,
// manda al login (o, si la petición la hizo htmx, le pide que redirija la página entera).

import { leerCookie, nombreCookieSesion } from '../seguridad/cookies.js';

export function autenticarWeb(autenticacion, config) {
  const cookie = nombreCookieSesion(config);
  return async (req, res, next) => {
    const token = leerCookie(req.headers.cookie, cookie);
    const usuario = token ? await autenticacion.autenticar(token, 'web') : null;

    if (!usuario) {
      if (req.get('HX-Request')) {
        // Sin esto, htmx metería la página de login dentro de la tabla.
        res.set('HX-Redirect', '/login');
        return res.status(401).end();
      }
      return res.redirect(303, '/login');
    }
    req.usuario = usuario;
    req.token = token;
    res.locals.usuario = usuario; // disponible en las plantillas
    next();
  };
}
