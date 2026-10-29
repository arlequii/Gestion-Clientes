// Servicio de clientes: las reglas de negocio de la gestión de clientes y contactos.
//
// Cada operación que modifica datos se hace en UNA transacción junto con su
// anotación en el histórico: nunca queda un cambio sin rastro ni un rastro sin
// cambio. El servicio no sabe nada de HTTP: recibe datos, lanza ErrorAplicacion
// y devuelve objetos. Lo usan tanto la API como la interfaz web.

import { ErrorAplicacion } from '../errores.js';
import { conTransaccion } from '../db/transaccion.js';
import { leerPaginacion, describirPaginacion, validarVarias } from '../validacion/entrada.js';
import { validarCliente, validarContacto, validarFiltros } from '../validacion/cliente.js';
import { crearRepositorioClientes } from '../repositorios/clientes.js';
import { crearRepositorioContactos } from '../repositorios/contactos.js';
import { crearRepositorioFacturas } from '../repositorios/facturas.js';
import { crearRepositorioComerciales } from '../repositorios/comerciales.js';
import { crearRepositorioHistorico } from '../repositorios/historico.js';

const MAX_CONTACTOS_ALTA = 20;
const MAX_LOTE = 100; // clientes que se pueden mover a la papelera (o restaurar) de una vez
const CAMPOS_CLIENTE = ['empresa', 'cif', 'direccion', 'cp', 'ciudad', 'pais', 'estado', 'fechaAlta'];
const CAMPOS_CONTACTO = ['nombre', 'email', 'telefono'];

/** Crea todos los repositorios sobre una misma conexión (para que compartan transacción). */
const repositoriosSobre = (db) => ({
  clientes: crearRepositorioClientes(db),
  contactos: crearRepositorioContactos(db),
  facturas: crearRepositorioFacturas(db),
  comerciales: crearRepositorioComerciales(db),
  historico: crearRepositorioHistorico(db),
});

/** Convierte los errores de la base de datos que el usuario puede provocar en mensajes claros. */
function traducirError(error) {
  if (error.code === '23505') {
    if (error.constraint === 'clientes_cif_unico') {
      return new ErrorAplicacion(409, 'Ya existe un cliente con ese CIF (puede estar en la papelera)', { cif: 'Ya existe un cliente con ese CIF' });
    }
    if (error.constraint === 'contactos_email_por_cliente') {
      return new ErrorAplicacion(409, 'Este cliente ya tiene un contacto con ese email', { email: 'Ya existe un contacto con ese email' });
    }
  }
  return error;
}

/** Cliente por id, bloqueado para modificarlo. Debe existir y no estar en la papelera. */
async function clienteEditable(repos, id) {
  const cliente = await repos.clientes.buscarPorId(id, { bloquear: true });
  if (!cliente) throw new ErrorAplicacion(404, 'Cliente no encontrado');
  if (cliente.eliminadoEn) throw new ErrorAplicacion(409, 'El cliente está en la papelera: restáuralo antes de modificarlo');
  return cliente;
}

/** Que el comercial indicado exista (y esté activo). */
async function comprobarComercial(repos, comercialId) {
  if (comercialId && !(await repos.comerciales.buscarPorId(comercialId))) {
    throw new ErrorAplicacion(400, 'Hay datos no válidos', { comercialId: 'El comercial indicado no existe' });
  }
}

/** Cambios entre un cliente guardado y los datos nuevos (solo lo que de verdad cambia). */
async function cambiosDeCliente(repos, actual, datos) {
  const cambios = CAMPOS_CLIENTE
    .filter((campo) => datos[campo] !== undefined && datos[campo] !== actual[campo])
    .map((campo) => ({ campo, anterior: actual[campo], nuevo: datos[campo] }));

  if (datos.comercialId !== undefined && datos.comercialId !== (actual.comercial?.id ?? null)) {
    const nuevo = datos.comercialId ? (await repos.comerciales.buscarPorId(datos.comercialId)).nombre : null;
    cambios.push({ campo: 'comercial', anterior: actual.comercial?.nombre ?? null, nuevo });
  }
  return cambios;
}

/**
 * Valida el alta completa (cliente + contactos) acumulando TODOS los errores.
 * Los de los contactos llevan el prefijo "contactos.0.", "contactos.1."...
 */
function validarAlta(entrada) {
  const detalles = {};
  const intentar = (validar, prefijo = '') => {
    try {
      return validar();
    } catch (error) {
      if (!(error instanceof ErrorAplicacion) || !error.detalles) throw error;
      for (const [campo, mensaje] of Object.entries(error.detalles)) detalles[prefijo + campo] = mensaje;
      return null;
    }
  };

  const cliente = intentar(() => validarCliente(entrada, { crear: true }));
  let contactos = [];
  if (!Array.isArray(entrada.contactos) || entrada.contactos.length < 1 || entrada.contactos.length > MAX_CONTACTOS_ALTA) {
    detalles.contactos = `Indica entre 1 y ${MAX_CONTACTOS_ALTA} contactos`;
  } else {
    contactos = entrada.contactos.map((c, i) => intentar(() => validarContacto(c, { crear: true }), `contactos.${i}.`));
    const vistos = new Set();
    contactos.forEach((c, i) => {
      if (c && vistos.has(c.datos.email)) detalles[`contactos.${i}.email`] = 'Este email está repetido en la petición';
      if (c) vistos.add(c.datos.email);
    });
  }

  if (Object.keys(detalles).length > 0) throw new ErrorAplicacion(400, 'Hay datos no válidos', detalles);
  return { cliente: cliente.datos, avisos: cliente.avisos, contactos: contactos.map((c) => c.datos) };
}

/**
 * Mueve varios clientes a la papelera (o los restaura) en UNA transacción: o se hacen todos o ninguno.
 * Los que no existen o ya estaban en el estado pedido se omiten sin fallar, para que repetir
 * la acción (por ejemplo, con dos pestañas abiertas) no dé error.
 */
async function cambiarPapeleraVarios(pool, ids, aPapelera, usuario) {
  const unicos = [...new Set(ids)];
  if (unicos.length < 1 || unicos.length > MAX_LOTE) {
    throw new ErrorAplicacion(400, `Selecciona entre 1 y ${MAX_LOTE} clientes`);
  }
  return conTransaccion(pool, async (db) => {
    const repos = repositoriosSobre(db);
    let cambiados = 0;
    // Siempre en el mismo orden: dos peticiones a la vez no se bloquean entre sí.
    for (const id of unicos.sort((a, b) => a - b)) {
      const actual = await repos.clientes.buscarPorId(id, { bloquear: true });
      if (!actual || Boolean(actual.eliminadoEn) === aPapelera) continue;
      await repos.clientes.marcarEliminado(id, aPapelera);
      await repos.historico.registrar(
        { clienteId: id, entidad: 'cliente', entidadId: id, accion: aPapelera ? 'baja' : 'restauracion', registro: `Cliente: ${actual.empresa}`, usuario }, [{}]);
      cambiados += 1;
    }
    return { cambiados, omitidos: unicos.length - cambiados };
  });
}

/** @param {{ pool: import('pg').Pool }} dependencias */
export function crearServicioClientes({ pool }) {
  const servicio = {
    /** Listado paginado. `consulta` es la query string tal cual llega. */
    async listar(consulta) {
      const [filtros, paginacion] = validarVarias(
        () => validarFiltros(consulta),
        () => leerPaginacion(consulta, { porPaginaPorDefecto: 10, maximo: 100 }));
      const { clientes, total } = await repositoriosSobre(pool).clientes.listar({ ...filtros, ...paginacion });
      return { datos: clientes, paginacion: describirPaginacion(paginacion, total) };
    },

    /** Ficha completa: cliente, contactos, facturas y facturación acumulada. */
    async obtener(id) {
      const repos = repositoriosSobre(pool);
      const cliente = await repos.clientes.buscarPorId(id);
      if (!cliente) throw new ErrorAplicacion(404, 'Cliente no encontrado');
      const [contactos, facturas] = await Promise.all([repos.contactos.listarPorCliente(id), repos.facturas.listarPorCliente(id)]);
      return { ...cliente, contactos, facturas };
    },

    /** @returns {Promise<{ cliente: object, avisos: string[] }>} */
    async crear(entrada, usuario) {
      const { cliente: datos, avisos, contactos } = validarAlta(entrada);
      try {
        const id = await conTransaccion(pool, async (db) => {
          const repos = repositoriosSobre(db);
          await comprobarComercial(repos, datos.comercialId);

          const id = await repos.clientes.crear(datos);
          const registro = `Cliente: ${datos.empresa}`;
          await repos.historico.registrar({ clienteId: id, entidad: 'cliente', entidadId: id, accion: 'alta', registro, usuario },
            [{ nuevo: datos.empresa }]);
          for (const c of contactos) {
            const creado = await repos.contactos.crear(id, c);
            await repos.historico.registrar(
              { clienteId: id, entidad: 'contacto', entidadId: creado.id, accion: 'alta', registro: `Contacto: ${c.nombre}`, usuario },
              [{ nuevo: c.nombre }]);
          }
          return id;
        });
        return { cliente: await servicio.obtener(id), avisos };
      } catch (error) {
        throw traducirError(error);
      }
    },

    /** Modifica solo los campos enviados. Si no cambia nada, no se toca nada ni se anota nada. */
    async actualizar(id, entrada, usuario) {
      try {
        const avisos = await conTransaccion(pool, async (db) => {
          const repos = repositoriosSobre(db);
          const actual = await clienteEditable(repos, id);
          const { datos, avisos } = validarCliente(entrada, { crear: false, actual });
          await comprobarComercial(repos, datos.comercialId);

          const cambios = await cambiosDeCliente(repos, actual, datos);
          if (cambios.length > 0) {
            await repos.clientes.actualizar(id, datos);
            await repos.historico.registrar(
              { clienteId: id, entidad: 'cliente', entidadId: id, accion: 'modificacion', registro: `Cliente: ${actual.empresa}`, usuario },
              cambios);
          }
          return avisos;
        });
        return { cliente: await servicio.obtener(id), avisos };
      } catch (error) {
        throw traducirError(error);
      }
    },

    /** Borrado lógico (papelera): el cliente se oculta pero no se pierde nada, y se puede restaurar. */
    async eliminar(id, usuario) {
      await conTransaccion(pool, async (db) => {
        const repos = repositoriosSobre(db);
        const actual = await clienteEditable(repos, id); // 409 si ya estaba en la papelera
        await repos.clientes.marcarEliminado(id, true);
        await repos.historico.registrar(
          { clienteId: id, entidad: 'cliente', entidadId: id, accion: 'baja', registro: `Cliente: ${actual.empresa}`, usuario }, [{}]);
      });
    },

    async restaurar(id, usuario) {
      await conTransaccion(pool, async (db) => {
        const repos = repositoriosSobre(db);
        const actual = await repos.clientes.buscarPorId(id, { bloquear: true });
        if (!actual) throw new ErrorAplicacion(404, 'Cliente no encontrado');
        if (!actual.eliminadoEn) throw new ErrorAplicacion(409, 'El cliente no está en la papelera');
        await repos.clientes.marcarEliminado(id, false);
        await repos.historico.registrar(
          { clienteId: id, entidad: 'cliente', entidadId: id, accion: 'restauracion', registro: `Cliente: ${actual.empresa}`, usuario }, [{}]);
      });
      return servicio.obtener(id);
    },

    /** Varios clientes a la papelera a la vez. @returns {Promise<{ cambiados: number, omitidos: number }>} */
    eliminarVarios(ids, usuario) {
      return cambiarPapeleraVarios(pool, ids, true, usuario);
    },

    /** Varios clientes fuera de la papelera a la vez. */
    restaurarVarios(ids, usuario) {
      return cambiarPapeleraVarios(pool, ids, false, usuario);
    },

    /** Número de clientes en la papelera (para la pestaña del listado). */
    contarPapelera() {
      return repositoriosSobre(pool).clientes.contarEliminados();
    },

    async historico(id, consulta) {
      const repos = repositoriosSobre(pool);
      if (!(await repos.clientes.buscarPorId(id))) throw new ErrorAplicacion(404, 'Cliente no encontrado');
      const paginacion = leerPaginacion(consulta, { porPaginaPorDefecto: 20, maximo: 100 });
      const { cambios, total } = await repos.historico.listar(id, paginacion);
      return { datos: cambios, paginacion: describirPaginacion(paginacion, total) };
    },

    // ---- Contactos ----

    async crearContacto(clienteId, entrada, usuario) {
      try {
        return await conTransaccion(pool, async (db) => {
          const repos = repositoriosSobre(db);
          await clienteEditable(repos, clienteId);
          const { datos } = validarContacto(entrada, { crear: true });
          const contacto = await repos.contactos.crear(clienteId, datos);
          await repos.historico.registrar(
            { clienteId, entidad: 'contacto', entidadId: contacto.id, accion: 'alta', registro: `Contacto: ${contacto.nombre}`, usuario },
            [{ nuevo: contacto.nombre }]);
          return contacto;
        });
      } catch (error) {
        throw traducirError(error);
      }
    },

    async actualizarContacto(clienteId, contactoId, entrada, usuario) {
      try {
        return await conTransaccion(pool, async (db) => {
          const repos = repositoriosSobre(db);
          await clienteEditable(repos, clienteId);
          const actual = await repos.contactos.buscar(clienteId, contactoId);
          if (!actual) throw new ErrorAplicacion(404, 'Contacto no encontrado');
          const { datos } = validarContacto(entrada, { crear: false });

          const cambios = CAMPOS_CONTACTO
            .filter((campo) => datos[campo] !== undefined && datos[campo] !== actual[campo])
            .map((campo) => ({ campo, anterior: actual[campo], nuevo: datos[campo] }));
          if (cambios.length === 0) return actual;

          await repos.contactos.actualizar(contactoId, datos);
          await repos.historico.registrar(
            { clienteId, entidad: 'contacto', entidadId: contactoId, accion: 'modificacion', registro: `Contacto: ${actual.nombre}`, usuario },
            cambios);
          return repos.contactos.buscar(clienteId, contactoId);
        });
      } catch (error) {
        throw traducirError(error);
      }
    },

    async eliminarContacto(clienteId, contactoId, usuario) {
      await conTransaccion(pool, async (db) => {
        const repos = repositoriosSobre(db);
        await clienteEditable(repos, clienteId);
        const actual = await repos.contactos.buscar(clienteId, contactoId);
        if (!actual) throw new ErrorAplicacion(404, 'Contacto no encontrado');
        if ((await repos.contactos.contar(clienteId)) <= 1) {
          throw new ErrorAplicacion(409, 'Un cliente debe conservar al menos un contacto');
        }
        await repos.contactos.eliminar(contactoId);
        await repos.historico.registrar(
          { clienteId, entidad: 'contacto', entidadId: contactoId, accion: 'eliminacion', registro: `Contacto: ${actual.nombre}`, usuario },
          [{ anterior: actual.nombre }]);
      });
    },

    /** Comerciales activos (para el filtro y el formulario). */
    comerciales() {
      return repositoriosSobre(pool).comerciales.listar();
    },
  };
  return servicio;
}
