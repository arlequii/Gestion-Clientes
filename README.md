# Gestión de clientes

Herramienta interna para gestionar clientes, sus contactos y sus facturas. Sustituye al Excel compartido que se rellenaba a mano: los datos pasan a una base de datos PostgreSQL, con una API REST y una interfaz web en español.

- **Web:** listado con búsqueda, filtros, orden y paginación; ficha del cliente con contactos, facturas, facturación acumulada e histórico de cambios; alta y edición; papelera (mover a la papelera uno o varios clientes y restaurarlos).
- **API REST** protegida con token, con una colección de ejemplos.
- **Importación** automática del Excel antiguo (`datos/clientes_antiguos.csv`), con informe de lo que se importa, se rechaza o queda pendiente de revisión.
- **Histórico de cambios** de clientes y contactos: qué cambió, cuándo, quién y con qué valores.

Si solo vas a usar la aplicación, lee el [manual de usuario](docs/manual-usuario.md).

## Cómo arrancar

Necesitas [Docker](https://docs.docker.com/get-docker/) con Docker Compose. Desde el repositorio recién clonado:

```bash
docker compose up --build
```

No hace falta crear ningún fichero de configuración. Cuando el log muestre `Aplicación escuchando en el puerto 3000`, abre <http://localhost:3000>.

**Usuario y contraseña.** El usuario es `admin@ejemplo.es`. En el primer arranque se genera una contraseña aleatoria que aparece **una sola vez** en el log:

```bash
docker compose logs app | grep "Contraseña generada"
```

Si prefieres fijar la tuya, copia `.env.example` a `.env`, rellena `ADMIN_PASSWORD` (mínimo 10 caracteres) y arranca con la base de datos vacía (ver más abajo).

**Qué ocurre en el primer arranque**, de forma automática: se crea el esquema de la base de datos, se crea el administrador y se importa `datos/clientes_antiguos.csv`. El resultado esperable con el fichero incluido es: 7 clientes y 13 facturas importadas, 1 factura duplicada, 2 rechazadas y 1 pendiente de revisión. El informe completo aparece en el log. En los arranques siguientes no se vuelve a importar nada.

| Quiero... | Comando |
|---|---|
| Parar la aplicación (los datos se conservan) | `docker compose down` |
| Borrar todos los datos y empezar de cero | `docker compose down -v` |
| Ver el log | `docker compose logs -f app` |
| Repetir la importación a mano | `docker compose exec app npm run importar` |

Si cambias `DB_PASSWORD` después del primer arranque, hay que borrar los datos con `docker compose down -v`, porque PostgreSQL fija la contraseña al crear el volumen.

## Cómo probar la API

Todas las rutas bajo `/api` exigen un token, salvo el inicio de sesión. Con `curl`:

```bash
# 1) Iniciar sesión: devuelve un token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ejemplo.es","clave":"LA_CONTRASEÑA"}'

# 2) Usar el token en el resto de peticiones
TOKEN=el_token_recibido
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/clientes?q=ebro&pais=España"
```

Hay una colección completa de ejemplos (alta, edición, filtros, errores...) en [`docs/api.http`](docs/api.http), que funciona con la extensión REST Client de VS Code.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/clientes` | Listado paginado. Busca por empresa, contacto, CIF o email; filtra por estado, país y comercial; ordena |
| `GET /api/clientes/{id}` | Cliente con contactos, facturas y facturación acumulada (sin IVA) |
| `POST /api/clientes` | Crea un cliente (con al menos un contacto) |
| `PUT /api/clientes/{id}` | Modifica solo los campos enviados |
| `DELETE /api/clientes/{id}` | Baja lógica: se puede restaurar |
| `POST /api/clientes/{id}/restaurar` | Restaura un cliente que está en la papelera |
| `GET /api/clientes/{id}/historico` | Histórico de cambios, paginado |
| `POST /api/clientes/{id}/contactos`, `PUT` y `DELETE .../contactos/{id}` | Gestión de contactos |
| `GET /api/comerciales`, `GET /api/paises` | Listas para filtros y formularios |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/yo` | Acceso con token |
| `GET /salud` | Comprobación de que la aplicación y la base de datos funcionan |

Los errores devuelven un JSON con un mensaje en español y, si es una validación, el motivo de cada campo.

## Tests

Un solo comando ejecuta todos los tests (con la base de datos de Docker en marcha):

```bash
docker compose run --rm app npm test
```

Cada test que necesita base de datos crea una temporal con nombre único y la borra al terminar, así que no toca los datos reales. Fuera de Docker, `npm test` funciona igual si hay un PostgreSQL accesible con las variables `DB_*`; si no lo hay, los tests de base de datos se omiten en vez de fallar.

## Estructura del proyecto

```
src/
  server.js          Arranque: migraciones, administrador, importación y servidor
  app.js             Construye la aplicación Express (fábrica con sus dependencias)
  config/            Lectura y validación de variables de entorno
  db/                Pool de PostgreSQL, transacciones y migraciones
  routes/            Rutas HTTP: API (JSON) y web (páginas), sin lógica de negocio
  servicios/         Reglas de negocio: clientes, contactos, histórico, acceso
  repositorios/      Todo el SQL, una pieza por tabla
  validacion/        Validación de lo que llega de la API y de los formularios
  importacion/       Lectura del CSV, normalización, plan por fila e informe
  dominio/           Países y formatos de CIF
  seguridad/         Contraseñas, tokens, cookies y límite de intentos
  middleware/        Cabeceras de seguridad, CSRF, sesiones, registro
  vistas/            Plantillas HTML (Nunjucks)
migraciones/         Esquema de la base de datos, en ficheros SQL numerados
public/              CSS y JavaScript propios de la interfaz
tests/               Tests automáticos
docs/                Manual de usuario, decisiones, colección de la API y guion de defensa
datos/               Excel antiguo en CSV
```

La idea central es la separación en capas: la **ruta** traduce HTTP, el **servicio** aplica las reglas y decide qué se guarda, y el **repositorio** habla con la base de datos. La web y la API usan el mismo servicio, así que una regla vive en un solo sitio.

## Decisiones técnicas

Todas están razonadas en [`docs/decisiones.md`](docs/decisiones.md). Las principales:

- **Node.js (JavaScript) y Express 5**, sin TypeScript: menos piezas y sin compilación; la validación es explícita.
- **SQL directo con `pg`, sin ORM**: SQL explícito, siempre con parámetros.
- **Interfaz servida por el backend** (Nunjucks, htmx y Bootstrap 5), sin React: un solo proyecto, sin fase de compilación del front, responsive y con aspecto de panel de administración. Funciona también sin JavaScript.
- **Normalización del Excel**: clientes, contactos y facturas en tablas separadas. Solo se fusionan clientes con el mismo CIF normalizado; lo dudoso queda pendiente de revisión. Las fechas se leen como día/mes/año y los importes siguen reglas explícitas.
- **Facturación acumulada calculada** en cada consulta (suma de bases imponibles, sin IVA), no guardada: nunca queda desactualizada.
- **Histórico en el servicio y en la misma transacción** que el cambio: no queda un cambio sin rastro ni un rastro sin cambio.
- **Papelera (borrado lógico):** eliminar mueve el cliente a la papelera y se puede restaurar. Nada se borra. En la ficha se pide además escribir el CIF; en el listado, que es reversible, basta una confirmación, y se pueden mover o restaurar varios a la vez.
- **Facturas de solo lectura**, con número único y total calculado por PostgreSQL.
- **CIF**: el formato es obligatorio y el dígito de control es solo un aviso, porque varios CIF de ejemplo no lo cumplen.

### Seguridad

- Contraseñas con hash `scrypt`; los tokens de sesión se guardan como hash, nunca en claro. Las sesiones duran 8 horas y se pueden cerrar.
- Límite de 5 intentos fallidos de login cada 15 minutos por origen y correo.
- Web: cookie `HttpOnly` y `SameSite=Lax` (con `Secure` y prefijo `__Host-` si se sirve por HTTPS: `COOKIE_SECURE=true`), protección CSRF y política de contenido (CSP) que no permite scripts ni estilos en línea. Bootstrap y htmx se sirven desde la propia aplicación, sin CDN.
- API: token Bearer en todas las rutas salvo el login. Entrada validada y con límite de tamaño; SQL siempre con parámetros; el orden del listado solo admite una lista cerrada de columnas.
- Los errores inesperados se registran, pero al usuario solo se le muestra un mensaje genérico. El registro de peticiones no guarda los parámetros de la dirección, porque pueden contener datos personales.
- La base de datos no se publica fuera de Docker. Sin dependencias con vulnerabilidades conocidas (`npm audit`).

## Despliegue en producción

Antes de exponer la aplicación a usuarios reales:

1. **Configuración.** Copia `.env.example` a `.env` y fija una `DB_PASSWORD` propia (los valores por defecto del `docker-compose.yml` son solo de desarrollo). Deja `ADMIN_PASSWORD` vacío para que se genere una aleatoria, y guárdala al verla en el log.
2. **HTTPS.** Publica la aplicación detrás de un proxy inverso con certificado (Nginx, Caddy, Traefik...) y pon `COOKIE_SECURE=true`. El proxy debe conservar la cabecera `Host` original, porque la protección CSRF la comprueba.
3. **Base de datos.** No publiques el puerto de PostgreSQL. Programa copias de seguridad, por ejemplo:

   ```bash
   docker compose exec -T db pg_dump -U clientes clientes > copia.sql
   ```

   y para restaurarla en una base vacía: `docker compose exec -T db psql -U clientes clientes < copia.sql`.
4. **Registro.** Con `NODE_ENV=production` cada evento es una línea JSON en la salida estándar, lista para enviarse a la herramienta de monitorización. No se registran datos personales ni parámetros de la URL.
5. **Salud.** `GET /salud` responde 200 si la aplicación y la base de datos funcionan, y 503 si no; sirve para las comprobaciones del proxy o del orquestador.
6. **Actualizaciones.** Las migraciones se aplican solas al arrancar, una sola vez y en orden. Actualizar es `git pull` y `docker compose up -d --build`.

## Mejoras previstas

- Pantalla de revisión manual de las filas pendientes de la importación, y una página con el informe de cada importación (hoy está en el log y en la base de datos).
- Acceso con SSO (OIDC) y verificación en dos pasos; cambio de contraseña y alta de usuarios desde la aplicación.
- Varios roles, por ejemplo comercial con acceso solo a sus clientes.
- Alta y edición de facturas, con series, rectificativas y estado de cobro.
- Control de ediciones simultáneas (hoy la fila se bloquea durante el cambio, pero gana el último que guarda).
- Copias de seguridad programadas y automatizadas de la base de datos.

## Documentación

- [Manual de usuario](docs/manual-usuario.md) y la página **Ayuda** dentro de la aplicación.
- [Decisiones técnicas y de datos](docs/decisiones.md).
- [Colección de ejemplos de la API](docs/api.http).
- [Guion para la revisión técnica](docs/defensa.md).
- [Uso de herramientas de IA](docs/IA.md).
