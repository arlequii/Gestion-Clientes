// Punto único donde se "montan" los servicios con sus dependencias.
// Cada pieza recibe sus dependencias en lugar de crearlas, de modo que los
// tests pueden sustituirlas.

import { crearRepositorioUsuarios } from '../repositorios/usuarios.js';
import { crearRepositorioSesiones } from '../repositorios/sesiones.js';
import { LimitadorIntentos } from '../seguridad/limitadorIntentos.js';
import { crearServicioAutenticacion } from './autenticacion.js';
import { crearServicioClientes } from './clientes.js';

/** @param {import('pg').Pool} pool */
export function crearServicios(pool) {
  const usuarios = crearRepositorioUsuarios(pool);
  const sesiones = crearRepositorioSesiones(pool);
  const limitador = new LimitadorIntentos();

  return {
    repositorios: { usuarios, sesiones },
    autenticacion: crearServicioAutenticacion({ usuarios, sesiones, limitador }),
    clientes: crearServicioClientes({ pool }),
  };
}
