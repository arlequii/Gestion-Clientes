// Ruta /salud: indica si la aplicación y su base de datos funcionan.
// La usa Docker para saber si el contenedor está sano.

import { Router } from 'express';
import { registrar } from '../registro.js';

/**
 * @param {import('pg').Pool} pool
 */
export function rutasSalud(pool) {
  const router = Router();

  router.get('/salud', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ estado: 'ok' });
    } catch (error) {
      // El detalle técnico solo va al registro; al cliente no se le cuenta.
      registrar('error', 'Comprobación de salud fallida', { error: error.message });
      res.status(503).json({ estado: 'error', detalle: 'base de datos no disponible' });
    }
  });

  return router;
}
