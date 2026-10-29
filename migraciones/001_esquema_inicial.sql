-- Esquema inicial de la base de datos.
--
-- Cada fichero de esta carpeta es una migración: se aplica una sola vez, en
-- orden alfabético, y no se edita después de publicarse. Para cambiar el
-- esquema se crea una migración nueva (002_..., 003_...).

-- ---------------------------------------------------------------------------
-- Acceso: usuarios y sesiones
-- ---------------------------------------------------------------------------

CREATE TABLE usuarios (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT        NOT NULL,
  nombre      TEXT        NOT NULL,
  clave_hash  TEXT        NOT NULL,                 -- nunca la contraseña en claro
  rol         TEXT        NOT NULL DEFAULT 'admin', -- por ahora solo hay uno; la columna deja la puerta abierta
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- El email es único sin distinguir mayúsculas.
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));

-- Una fila por sesión de la web (cookie) o por token de la API (Bearer).
-- Se guarda el hash del identificador: si alguien lee la tabla, no puede usarlo.
CREATE TABLE sesiones (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  BIGINT      NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('web', 'api')),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ NOT NULL
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX sesiones_expira ON sesiones (expira_en);

-- ---------------------------------------------------------------------------
-- Clientes, contactos y facturas
-- ---------------------------------------------------------------------------

-- Lista de comerciales. Evita variantes como "elena sanz" / "Elena  Sanz".
CREATE TABLE comerciales (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre  TEXT    NOT NULL CHECK (btrim(nombre) <> ''),
  activo  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX comerciales_nombre_unico ON comerciales (lower(nombre));

CREATE TABLE clientes (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa        TEXT NOT NULL CHECK (btrim(empresa) <> ''),
  -- CIF/NIF/IVA intracomunitario ya normalizado (mayúsculas, sin espacios ni guiones).
  -- Es único incluso entre clientes dados de baja: un cliente eliminado se restaura, no se duplica.
  cif            TEXT NOT NULL CHECK (cif <> ''),
  direccion      TEXT,
  cp             TEXT,
  ciudad         TEXT,
  pais           TEXT NOT NULL,
  comercial_id   BIGINT REFERENCES comerciales (id),
  estado         TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
  fecha_alta     DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- fecha de última modificación
  eliminado_en   TIMESTAMPTZ                          -- NULL = visible; con fecha = borrado lógico
);
CREATE UNIQUE INDEX clientes_cif_unico ON clientes (cif);
CREATE INDEX clientes_filtros ON clientes (estado, pais, comercial_id) WHERE eliminado_en IS NULL;

CREATE TABLE contactos (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id     BIGINT NOT NULL REFERENCES clientes (id),
  nombre         TEXT   NOT NULL CHECK (btrim(nombre) <> ''),
  email          TEXT   NOT NULL,   -- se guarda en minúsculas y sin espacios
  telefono       TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Una misma persona no puede repetirse dentro del mismo cliente.
CREATE UNIQUE INDEX contactos_email_por_cliente ON contactos (cliente_id, lower(email));
CREATE INDEX contactos_email ON contactos (lower(email));

-- Facturas importadas: solo lectura desde la aplicación.
CREATE TABLE facturas (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id       BIGINT        NOT NULL REFERENCES clientes (id),
  numero           TEXT          NOT NULL UNIQUE,
  fecha_factura    DATE          NOT NULL,
  base_imponible   NUMERIC(12,2) NOT NULL CHECK (base_imponible >= 0),
  iva_porcentaje   NUMERIC(5,2)  NOT NULL CHECK (iva_porcentaje BETWEEN 0 AND 100),
  -- El total lo calcula PostgreSQL: no puede quedar inconsistente con base e IVA.
  total            NUMERIC(12,2) GENERATED ALWAYS AS
                     (round(base_imponible * (1 + iva_porcentaje / 100), 2)) STORED
);
-- Acelera la suma de la facturación acumulada de cada cliente.
CREATE INDEX facturas_cliente ON facturas (cliente_id);

-- ---------------------------------------------------------------------------
-- Histórico de cambios
-- ---------------------------------------------------------------------------

-- Una fila por campo modificado. Las altas, bajas y restauraciones se anotan
-- con una sola fila (campo vacío). Lo escribe la capa de servicio dentro de la
-- misma transacción que el cambio, así que nunca queda un cambio sin su rastro.
CREATE TABLE historico_cambios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      BIGINT      NOT NULL REFERENCES clientes (id),
  entidad         TEXT        NOT NULL CHECK (entidad IN ('cliente', 'contacto')),
  entidad_id      BIGINT      NOT NULL,  -- id del cliente o del contacto modificado
  accion          TEXT        NOT NULL CHECK (accion IN ('alta', 'modificacion', 'baja', 'restauracion', 'eliminacion')),
  campo           TEXT,
  valor_anterior  TEXT,
  valor_nuevo     TEXT,
  usuario_id      BIGINT REFERENCES usuarios (id) ON DELETE SET NULL,
  usuario_email   TEXT        NOT NULL,  -- copia del email: el histórico se entiende aunque el usuario cambie
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX historico_cliente ON historico_cambios (cliente_id, creado_en DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Informe de importaciones
-- ---------------------------------------------------------------------------

CREATE TABLE importaciones (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fichero      TEXT        NOT NULL,
  iniciada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resultado de cada fila del fichero, con su contenido original.
CREATE TABLE importacion_filas (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  importacion_id   BIGINT NOT NULL REFERENCES importaciones (id) ON DELETE CASCADE,
  numero_fila      INTEGER NOT NULL,   -- posición en el fichero (la cabecera es la fila 1)
  resultado        TEXT    NOT NULL CHECK (resultado IN ('importada', 'duplicada', 'rechazada', 'pendiente')),
  motivo           TEXT,               -- por qué se rechaza o queda pendiente
  avisos           TEXT[]  NOT NULL DEFAULT '{}',  -- interpretaciones dudosas que se han aceptado
  base_imponible   NUMERIC(12,2),      -- para el informe de cuadre
  datos_originales JSONB   NOT NULL
);
CREATE INDEX importacion_filas_importacion ON importacion_filas (importacion_id, numero_fila);

-- ---------------------------------------------------------------------------
-- Fecha de última modificación automática
-- ---------------------------------------------------------------------------

-- Se hace en la base de datos para que no dependa de que cada consulta se
-- acuerde de actualizarla.
CREATE FUNCTION actualizar_modificado_en() RETURNS trigger AS $$
BEGIN
  NEW.modificado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clientes_modificado BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION actualizar_modificado_en();
CREATE TRIGGER contactos_modificado BEFORE UPDATE ON contactos
  FOR EACH ROW EXECUTE FUNCTION actualizar_modificado_en();

-- Cambiar, añadir o quitar un contacto también cuenta como modificar al cliente.
CREATE FUNCTION marcar_cliente_modificado() RETURNS trigger AS $$
BEGIN
  UPDATE clientes SET modificado_en = now()
   WHERE id = COALESCE(NEW.cliente_id, OLD.cliente_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contactos_marca_cliente AFTER INSERT OR UPDATE OR DELETE ON contactos
  FOR EACH ROW EXECUTE FUNCTION marcar_cliente_modificado();
