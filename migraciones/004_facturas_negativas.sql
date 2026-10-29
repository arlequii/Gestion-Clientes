-- Las facturas rectificativas y los abonos tienen base imponible negativa.
-- El total (columna generada) y la facturación acumulada las restan solos.
ALTER TABLE facturas DROP CONSTRAINT facturas_base_imponible_check;
