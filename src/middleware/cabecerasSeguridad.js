// Cabeceras HTTP que endurecen la aplicación frente a ataques habituales.

// Política de contenido (CSP): el navegador solo ejecuta y carga lo que viene
// de esta misma aplicación. Así, aunque alguien consiguiera colar un <script>
// en una página, no se ejecutaría. Por eso las plantillas no llevan scripts
// ni estilos "en línea".
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

export function cabecerasSeguridad(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',        // el navegador no "adivina" el tipo de fichero
    'X-Frame-Options': 'DENY',                  // la web no se puede incrustar en otra (clickjacking)
    'Referrer-Policy': 'same-origin',           // no se filtran URLs a otros sitios
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  // Páginas y API muestran datos personales: que nadie las guarde en caché.
  // Los ficheros estáticos (/vendor, /static) quedan fuera: pueden cachearse.
  if (!req.path.startsWith('/vendor') && !req.path.startsWith('/static')) res.set('Cache-Control', 'no-store');
  next();
}
