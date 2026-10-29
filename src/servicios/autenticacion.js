// Servicio de autenticación: reglas de negocio del acceso (comprobar la
// contraseña, limitar intentos, abrir y cerrar sesiones).
// No sabe nada de HTTP ni de SQL: usa repositorios y lanza ErrorAplicacion.

import { ErrorAplicacion } from '../errores.js';
import { hashearClave, verificarClave } from '../seguridad/claves.js';

const HORAS_SESION = 8;
const MENSAJE_CREDENCIALES = 'Email o contraseña incorrectos';

// Hash de una contraseña inventada. Se usa cuando el email no existe, para
// que la respuesta tarde lo mismo que con un email válido y no se pueda
// averiguar qué emails están registrados midiendo el tiempo.
let hashFalso;

/**
 * @param {{ usuarios: object, sesiones: object, limitador: import('../seguridad/limitadorIntentos.js').LimitadorIntentos }} dependencias
 */
export function crearServicioAutenticacion({ usuarios, sesiones, limitador }) {
  return {
    /**
     * Abre una sesión si el email y la contraseña son correctos.
     * @param {{ email: string, clave: string, tipo: 'web'|'api', origen: string }} datos
     *   `origen` identifica a quien llama (su IP), para limitar los intentos.
     * @returns {Promise<{ token: string, expiraEn: Date, usuario: object }>}
     * @throws {ErrorAplicacion} 401 si las credenciales no valen; 429 si hay demasiados intentos
     */
    async iniciarSesion({ email, clave, tipo, origen }) {
      const claveLimite = `${origen}|${email.toLowerCase()}`;
      if (limitador.estaBloqueado(claveLimite)) {
        throw new ErrorAplicacion(429, 'Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.');
      }

      const usuario = await usuarios.buscarPorEmail(email);
      hashFalso ??= await hashearClave('clave-que-nadie-usa');
      const correcta = await verificarClave(clave, usuario?.clave_hash ?? hashFalso);

      // El mismo mensaje para "no existe", "clave mala" y "usuario desactivado".
      if (!usuario || !usuario.activo || !correcta) {
        limitador.registrarFallo(claveLimite);
        throw new ErrorAplicacion(401, MENSAJE_CREDENCIALES);
      }

      limitador.reiniciar(claveLimite);
      await sesiones.eliminarCaducadas(); // limpieza oportunista
      const { token, expiraEn } = await sesiones.crear({ usuarioId: usuario.id, tipo, horas: HORAS_SESION });
      return {
        token, expiraEn,
        usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
      };
    },

    /** Usuario al que pertenece un token válido, o null. */
    autenticar(token, tipo) {
      return sesiones.buscarUsuario(token, tipo);
    },

    cerrarSesion(token) {
      return sesiones.eliminar(token);
    },
  };
}
