-- Descripción legible del registro modificado ("Cliente: Construcciones Ebro SL",
-- "Contacto: Marta Gil"). Se guarda copiada: así el histórico se entiende
-- aunque el contacto se elimine o el cliente cambie de nombre.
ALTER TABLE historico_cambios ADD COLUMN registro TEXT;
