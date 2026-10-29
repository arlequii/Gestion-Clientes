// Importación del CSV a PostgreSQL.
//
// Orquesta: leer el CSV → planificar (decidir qué hacer con cada fila) →
// guardar todo en UNA transacción (o se importa todo o no se importa nada)
// → devolver el informe. Es seguro repetirla: lo que ya existe se detecta
// por CIF y por número de factura y no se duplica.

import { readFile } from 'node:fs/promises';
import { leerCsv } from './csv.js';
import { planificar } from './planificar.js';
import { centimosATexto } from './normalizar.js';

const USUARIO_IMPORTACION = 'importación'; // aparece en el histórico como autor de las altas

/** Busca el comercial por nombre (sin distinguir mayúsculas) y lo crea si no existe. */
async function obtenerComercial(db, nombre) {
  if (!nombre) return null;
  const { rows } = await db.query('SELECT id FROM comerciales WHERE lower(nombre) = lower($1)', [nombre]);
  if (rows.length > 0) return rows[0].id;
  return (await db.query('INSERT INTO comerciales (nombre) VALUES ($1) RETURNING id', [nombre])).rows[0].id;
}

/** Anota un alta en el histórico. */
function anotarAlta(db, clienteId, entidad, entidadId, registro) {
  return db.query(
    `INSERT INTO historico_cambios (cliente_id, entidad, entidad_id, accion, registro, usuario_email)
     VALUES ($1, $2, $3, 'alta', $4, $5)`, [clienteId, entidad, entidadId, registro, USUARIO_IMPORTACION]);
}

/** Suma de céntimos de las filas que cumplen una condición. */
const sumar = (filas, condicion) => filas.filter(condicion).reduce((s, f) => s + (f.baseCentimos ?? 0), 0);

/**
 * Importa el contenido de un CSV.
 * @param {import('pg').Pool} pool
 * @param {string} texto contenido del fichero
 * @param {string} nombreFichero solo para el informe
 * @returns {Promise<object>} informe de la importación
 * @throws {Error} si el formato del CSV no es el esperado (no se guarda nada)
 */
export async function importarTexto(pool, texto, nombreFichero) {
  const plan = planificar(leerCsv(texto));
  const filaPorNumero = new Map(plan.filas.map((f) => [f.numeroFila, f]));
  const creado = { clientes: 0, contactos: 0, facturas: 0, baseCentimos: 0 };

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [importacion] } = await db.query(
      'INSERT INTO importaciones (fichero) VALUES ($1) RETURNING id', [nombreFichero]);

    for (const c of plan.clientes) {
      const comercialId = await obtenerComercial(db, c.comercial);

      // Si el CIF ya existía (importación repetida) se reutiliza el cliente sin tocarlo.
      let { rows } = await db.query(
        `INSERT INTO clientes (empresa, cif, direccion, cp, ciudad, pais, comercial_id, estado, fecha_alta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (cif) DO NOTHING RETURNING id`,
        [c.empresa, c.cif, c.direccion, c.cp, c.ciudad, c.pais, comercialId, c.estado, c.fechaAlta]);
      if (rows.length > 0) {
        creado.clientes++;
        await anotarAlta(db, rows[0].id, 'cliente', rows[0].id, `Cliente: ${c.empresa}`);
      } else {
        rows = (await db.query('SELECT id FROM clientes WHERE cif = $1', [c.cif])).rows;
      }
      const clienteId = rows[0].id;

      for (const p of c.contactos) {
        const { rows: nuevo } = await db.query(
          `INSERT INTO contactos (cliente_id, nombre, email, telefono) VALUES ($1,$2,$3,$4)
           ON CONFLICT (cliente_id, lower(email)) DO NOTHING RETURNING id`,
          [clienteId, p.nombre, p.email, p.telefono]);
        if (nuevo.length > 0) {
          creado.contactos++;
          await anotarAlta(db, clienteId, 'contacto', nuevo[0].id, `Contacto: ${p.nombre}`);
        }
      }

      for (const f of c.facturas) {
        const { rows: nueva } = await db.query(
          `INSERT INTO facturas (cliente_id, numero, fecha_factura, base_imponible, iva_porcentaje)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (numero) DO NOTHING RETURNING id`,
          [clienteId, f.numero, f.fecha, centimosATexto(f.baseCentimos), f.iva]);
        if (nueva.length > 0) {
          creado.facturas++;
          creado.baseCentimos += f.baseCentimos;
        } else {
          const fila = filaPorNumero.get(f.filaOrigen);
          fila.resultado = 'duplicada';
          fila.motivo = `La factura ${f.numero} ya existía en la base de datos`;
        }
      }
    }

    // Se guarda el resultado de TODAS las filas, con su contenido original.
    for (const f of plan.filas) {
      await db.query(
        `INSERT INTO importacion_filas (importacion_id, numero_fila, resultado, motivo, avisos, base_imponible, datos_originales)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [importacion.id, f.numeroFila, f.resultado, f.motivo, f.avisos,
          f.baseCentimos === null ? null : centimosATexto(f.baseCentimos), f.datosOriginales]);
    }
    await db.query('COMMIT');

    return construirInforme(importacion.id, nombreFichero, plan.filas, creado);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

/** Resumen y cuadre. La parte "importadas" sale de lo realmente insertado en la base de datos. */
function construirInforme(id, fichero, filas, creado) {
  const cuenta = (resultado) => filas.filter((f) => f.resultado === resultado).length;
  const cuadre = {
    fichero: sumar(filas, () => true),
    importadas: creado.baseCentimos,
    duplicadas: sumar(filas, (f) => f.resultado === 'duplicada'),
    rechazadas: sumar(filas, (f) => f.resultado === 'rechazada'),
    pendientes: sumar(filas, (f) => f.resultado === 'pendiente'),
  };
  cuadre.diferencia = cuadre.fichero - (cuadre.importadas + cuadre.duplicadas + cuadre.rechazadas + cuadre.pendientes);

  return {
    id, fichero,
    resumen: {
      filas: filas.length, importadas: cuenta('importada'), duplicadas: cuenta('duplicada'),
      rechazadas: cuenta('rechazada'), pendientes: cuenta('pendiente'),
      clientesCreados: creado.clientes, contactosCreados: creado.contactos, facturasCreadas: creado.facturas,
    },
    // Importes en euros, como texto con dos decimales.
    cuadre: Object.fromEntries(Object.entries(cuadre).map(([k, v]) => [k, centimosATexto(v)])),
    filas: filas.map(({ numeroFila, resultado, motivo, avisos }) => ({ numeroFila, resultado, motivo, avisos })),
  };
}

/** Lee un fichero CSV del disco (UTF-8) e importa su contenido. */
export async function importarFichero(pool, ruta) {
  return importarTexto(pool, await readFile(ruta, 'utf8'), ruta.split('/').pop());
}

/**
 * Importa el fichero solo si nunca se ha hecho una importación. Así, borrar
 * clientes más adelante no provoca que vuelvan a aparecer al reiniciar.
 * @returns {Promise<object|null>} el informe, o null si no hacía falta importar
 */
export async function importarSiNuncaSeImporto(pool, ruta) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM importaciones');
  return rows[0].n === 0 ? importarFichero(pool, ruta) : null;
}

/** Informe legible para la consola. */
export function informeATexto(informe) {
  const { resumen: r, cuadre: c } = informe;
  const lineas = [
    `Importación de ${informe.fichero}`,
    `Filas: ${r.filas} → importadas ${r.importadas}, duplicadas ${r.duplicadas}, rechazadas ${r.rechazadas}, pendientes ${r.pendientes}`,
    `Creados: ${r.clientesCreados} clientes, ${r.contactosCreados} contactos, ${r.facturasCreadas} facturas`,
    `Cuadre de bases (€): fichero ${c.fichero} = importadas ${c.importadas} + duplicadas ${c.duplicadas} + rechazadas ${c.rechazadas} + pendientes ${c.pendientes} (diferencia ${c.diferencia})`,
  ];
  for (const f of informe.filas) {
    if (f.resultado === 'importada' && f.avisos.length === 0) continue;
    lineas.push(`  Fila ${f.numeroFila} [${f.resultado}]${f.motivo ? ' ' + f.motivo : ''}`);
    f.avisos.forEach((a) => lineas.push(`    aviso: ${a}`));
  }
  return lineas.join('\n');
}
