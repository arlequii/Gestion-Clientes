// Construcción de la aplicación Express.
//
// `crearApp` es una fábrica: recibe sus dependencias (el pool de base de
// datos y, opcionalmente, los servicios) y devuelve la aplicación lista. Así
// los tests pueden crearla con una base de datos falsa o con servicios de
// prueba, y server.js con la real, sin tocar este fichero.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import nunjucks from 'nunjucks';
import { ErrorAplicacion } from './errores.js';
import { registrar } from './registro.js';
import { registroPeticiones } from './middleware/registroPeticiones.js';
import { cabecerasSeguridad } from './middleware/cabecerasSeguridad.js';
import { autenticarApi } from './middleware/autenticarApi.js';
import { crearServicios } from './servicios/index.js';
import { rutasSalud } from './routes/salud.js';
import { rutasAuth } from './routes/auth.js';
import { rutasClientes, rutasCatalogos } from './routes/clientes.js';
import { NOMBRES_PAISES } from './dominio/paises.js';
import { rutasWeb } from './routes/web/index.js';
import { filtros } from './vistas/filtros.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_POR_DEFECTO = { entorno: 'test', cookieSegura: false };

/** Las rutas de la API responden JSON; el resto son páginas HTML. */
const esApi = (req) => req.path === '/api' || req.path.startsWith('/api/');

/**
 * @param {{ pool: import('pg').Pool, servicios?: ReturnType<typeof crearServicios>, config?: object }} dependencias
 * @returns {import('express').Express}
 */
export function crearApp({ pool, servicios = crearServicios(pool), config = CONFIG_POR_DEFECTO }) {
  const app = express();

  // No anunciar qué tecnología usa el servidor.
  app.disable('x-powered-by');

  // Plantillas HTML (Nunjucks). `autoescape` convierte < > & " en texto inofensivo: protege de XSS.
  const entornoVistas = nunjucks.configure(path.join(RAIZ, 'src/vistas'), {
    autoescape: true, express: app, noCache: config.entorno !== 'production',
  });
  for (const [nombre, funcion] of Object.entries(filtros)) entornoVistas.addFilter(nombre, funcion);

  // Ficheros estáticos: Bootstrap, iconos y htmx se sirven desde node_modules (sin CDN externos).
  const estatico = (carpeta) => express.static(path.join(RAIZ, carpeta), { maxAge: '7d', index: false });
  app.use('/vendor/bootstrap', estatico('node_modules/bootstrap/dist'));
  app.use('/vendor/bootstrap-icons', estatico('node_modules/bootstrap-icons/font'));
  app.use('/vendor/htmx', estatico('node_modules/htmx.org/dist'));
  app.use('/static', estatico('public'));

  app.use(registroPeticiones);
  app.use(cabecerasSeguridad);
  app.use(express.json({ limit: '100kb' })); // cuerpos JSON; el límite evita peticiones gigantes
  app.use(express.urlencoded({ extended: false, limit: '100kb' })); // formularios HTML

  app.use(rutasSalud(pool));

  // API: solo el login es público. Todo lo demás bajo /api exige token.
  app.use('/api/auth', rutasAuth(servicios));
  app.use('/api', autenticarApi(servicios.autenticacion));
  app.use('/api/clientes', rutasClientes(servicios));
  app.use('/api', rutasCatalogos(servicios, NOMBRES_PAISES));

  // Páginas web (login, clientes...).
  app.use(rutasWeb(servicios, config));

  // Ninguna ruta anterior ha respondido.
  app.use((req, res) => {
    if (esApi(req)) return res.status(404).json({ error: 'Recurso no encontrado' });
    res.status(404).render('error.njk', { estado: 404, mensaje: 'La página que buscas no existe.', usuario: res.locals.usuario });
  });

  // Último recurso ante un error. Los ErrorAplicacion y los errores de
  // petición mal formada (JSON roto, cuerpo demasiado grande) se explican al
  // usuario; cualquier otro se registra y se responde sin revelar detalles.
  app.use((error, req, res, next) => {
    if (!esApi(req)) {
      // Páginas web: se muestra una página de error amigable (sin detalles técnicos).
      const estado = error instanceof ErrorAplicacion ? error.estado : (error.status ?? 500);
      if (estado >= 500) registrar('error', 'Error no controlado', { ruta: req.path, error: error.message, pila: error.stack });
      const mensaje = error instanceof ErrorAplicacion || estado < 500 ? error.message : 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
      return res.status(estado).render('error.njk', { estado, mensaje });
    }
    if (error instanceof ErrorAplicacion) {
      return res.status(error.estado).json({ error: error.message, detalles: error.detalles });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'La petición es demasiado grande' });
    }
    registrar('error', 'Error no controlado', { ruta: req.path, error: error.message, pila: error.stack });
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
