// Protección contra CSRF: impide que otro sitio web haga que el navegador de
// un usuario envíe peticiones a esta aplicación aprovechando su sesión abierta.
//
// Capas de defensa:
//   1. La cookie es SameSite=Lax: el navegador no la envía en POST de otros sitios.
//   2. Este middleware rechaza los POST/PUT/DELETE cuyo origen no sea la propia
//      aplicación, mirando las cabeceras Sec-Fetch-Site y Origin, que los
//      navegadores añaden solos y las páginas ajenas no pueden falsificar.
// Las peticiones sin ninguna de las dos cabeceras no vienen de un navegador
// moderno (curl, scripts) y no pueden aprovechar una sesión del navegador.

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function protegerCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const sitio = req.get('sec-fetch-site');
  const origen = req.get('origin');
  let origenValido = true;
  if (origen) {
    try { origenValido = new URL(origen).host === req.get('host'); } catch { origenValido = false; }
  }
  if ((sitio && !['same-origin', 'none'].includes(sitio)) || !origenValido) {
    return res.status(403).render('error.njk', { estado: 403, mensaje: 'La petición no se puede verificar. Vuelve a la página anterior e inténtalo de nuevo.' });
  }
  next();
}
