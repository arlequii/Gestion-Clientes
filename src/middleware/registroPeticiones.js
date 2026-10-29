// Registra una línea por petición: método, ruta, código y duración.
//
// Se escribe solo la ruta, nunca los parámetros de la URL (?q=...), porque
// pueden contener datos personales, como el email de un contacto.
// La comprobación de salud se omite para no llenar el registro de ruido.

import { registrar } from '../registro.js';

export function registroPeticiones(req, res, next) {
  if (req.path === '/salud') {
    return next();
  }

  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
    registrar(res.statusCode >= 500 ? 'error' : 'info', 'petición', {
      metodo: req.method, ruta: req.path, estado: res.statusCode, ms,
    });
  });
  next();
}
