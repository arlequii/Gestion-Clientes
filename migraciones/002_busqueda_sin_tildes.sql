-- Búsqueda sin distinguir tildes: "clinica" encuentra "Clínica".
-- La extensión `unaccent` viene incluida con PostgreSQL (también en la imagen
-- de Docker) y el usuario de la aplicación es el propietario de la base de datos.
CREATE EXTENSION IF NOT EXISTS unaccent;
