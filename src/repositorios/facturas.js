// Repositorio de facturas (solo lectura: llegan por la importación).

export function crearRepositorioFacturas(db) {
  return {
    async listarPorCliente(clienteId) {
      const { rows } = await db.query(
        `SELECT id, numero, fecha_factura, base_imponible, iva_porcentaje, total
           FROM facturas WHERE cliente_id = $1 ORDER BY fecha_factura DESC, id DESC`, [clienteId]);
      return rows.map((f) => ({
        id: f.id, numero: f.numero, fechaFactura: f.fecha_factura,
        baseImponible: f.base_imponible, ivaPorcentaje: f.iva_porcentaje, total: f.total,
      }));
    },
  };
}
