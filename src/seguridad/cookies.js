// Cookie de sesión de la web.
//
// Es HttpOnly (el JavaScript de la página no puede leerla, así que un fallo
// XSS no la roba) y SameSite=Lax (el navegador no la envía en peticiones
// que vienen de otros sitios, primera defensa contra CSRF). Con HTTPS
// (COOKIE_SECURE=true) además es Secure y usa el prefijo __Host-, que impide
// que otro subdominio la sobrescriba.

export function nombreCookieSesion(config) {
  return config.cookieSegura ? '__Host-sesion' : 'sesion';
}

/** Opciones para `res.cookie`. `expira` es la fecha de caducidad de la sesión. */
export function opcionesCookieSesion(config, expira) {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSegura, path: '/', ...(expira ? { expires: expira } : {}) };
}

/** Lee una cookie de la cabecera `Cookie: a=1; b=2`. Devuelve undefined si no está. */
export function leerCookie(cabecera, nombre) {
  for (const trozo of String(cabecera ?? '').split(';')) {
    const i = trozo.indexOf('=');
    if (i > 0 && trozo.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(trozo.slice(i + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
