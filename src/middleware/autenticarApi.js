// Protege las rutas de la API: exige una cabecera  Authorization: Bearer <token>.
// Si el token es válido, deja el usuario en `req.usuario`; si no, responde 401.

import { ErrorAplicacion } from '../errores.js';

/** @param {{ autenticar: Function }} autenticacion servicio de autenticación */
export function autenticarApi(autenticacion) {
  return async (req, res, next) => {
    const coincidencia = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
    const usuario = coincidencia ? await autenticacion.autenticar(coincidencia[1], 'api') : null;
    if (!usuario) {
      res.set('WWW-Authenticate', 'Bearer');
      throw new ErrorAplicacion(401, 'Acceso no autorizado: falta un token válido');
    }
    req.usuario = usuario;
    req.token = coincidencia[1];
    next();
  };
}
