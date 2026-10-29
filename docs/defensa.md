# Guion para la revisión técnica

Notas para explicar y modificar la aplicación en directo. No es documentación de uso: es una chuleta de qué decir, dónde mirar y qué tocar.

## Antes de la revisión

1. Arranca la aplicación y úsala: busca, filtra, crea un cliente, edítalo, muévelo a la papelera (desde su fila y desde la ficha), restáuralo, prueba la selección múltiple y mira el histórico.
2. Lee, por este orden, los ficheros que concentran la lógica: `src/servicios/clientes.js`, `src/repositorios/clientes.js`, `src/validacion/cliente.js`, `src/importacion/planificar.js`, `src/routes/web/fichas.js` y `migraciones/001_esquema_inicial.sql`.
3. Ejecuta los tests y mira uno de cada tipo (`tests/normalizar.test.js`, `tests/clientes.test.js`, `tests/web-fichas.test.js`).

## La aplicación en un minuto

Es una aplicación Node.js con Express y PostgreSQL. Tiene una API REST y una web en español que usan **el mismo servicio**. Los datos vienen del Excel antiguo, que se normaliza al importarlo (clientes, contactos y facturas en tablas separadas). Cada cambio en un cliente o contacto se anota en un histórico en la misma transacción. Todo arranca con `docker compose up`.

## Recorrido de una petición

Ejemplo: modificar un cliente desde la web (`POST /clientes/12`).

1. `src/routes/web/fichas.js` recibe el formulario y lo traduce a los datos que espera el servicio. No tiene reglas de negocio.
2. `src/servicios/clientes.js` → `actualizar`: abre una transacción, bloquea la fila del cliente, valida los datos, calcula qué campos cambian de verdad y, solo si hay cambios, los guarda y anota una fila de histórico por campo.
3. `src/validacion/cliente.js` valida y limpia (CIF contra el país, email, estado, fecha...). Devuelve todos los errores a la vez, uno por campo.
4. `src/repositorios/clientes.js` ejecuta el SQL, siempre con parámetros.
5. La ruta redirige a la ficha (303); si hay errores, vuelve a mostrar el formulario con ellos.

La API sigue el mismo camino desde `src/routes/clientes.js`.

## Patrones que se usan (y dónde)

- **Capas / servicio:** ruta → servicio → repositorio. Cada capa tiene una sola responsabilidad.
- **Repositorio:** `src/repositorios/`, un objeto por tabla que esconde el SQL.
- **Fábrica:** `crearApp`, `crearServicios` y `crearRepositorio*` reciben sus dependencias y devuelven el objeto listo. Por eso los tests pueden crear la aplicación con una base de datos temporal.
- **Cadena de responsabilidad:** los middleware de Express (cabeceras de seguridad, sesión, CSRF) se encadenan, y cada uno decide si deja pasar la petición.

No se han añadido más patrones a propósito: el enunciado prefiere una solución sencilla.

## Preguntas que pueden hacerte

**¿Por qué sin ORM?** El SQL queda visible y es fácil de explicar; el modelo es pequeño. Con más tablas o más equipo, un ORM o un constructor de consultas empezaría a compensar.

**¿Por qué sin React?** La web son listados, filtros, una ficha y formularios: no justifica una aplicación aparte con su compilación. Con Nunjucks y htmx, todo vive en un proyecto y funciona incluso sin JavaScript. Si la interfaz creciera mucho, la API ya existe y se podría construir un front aparte.

**¿Por qué la facturación acumulada se calcula y no se guarda?** Un dato guardado duplica otro que ya existe y puede desincronizarse. La suma es rápida con el índice por cliente. Si el volumen creciera, se pasaría a una columna mantenida por la base de datos sin cambiar la API.

**¿Por qué el histórico lo escribe el servicio y no un trigger?** Es más fácil de leer, de probar y permite guardar el usuario y una descripción legible. A cambio, todo cambio debe pasar por el servicio, y así es: web y API lo usan. La fecha de última modificación sí la actualiza un trigger.

**¿Por qué borrado lógico?** Un cliente tiene facturas y datos personales que hay que conservar; borrar la fila las perdería. El CIF se mantiene único para que un cliente de la papelera se restaure en vez de duplicarse.

**¿Cómo funciona la papelera y la selección múltiple?** «Papelera» es el borrado lógico con otro nombre: la columna `eliminado_en` tiene fecha o está vacía. El listado filtra por ella (`src/repositorios/clientes.js`) y las pestañas son dos enlaces normales a `/clientes` y `/clientes?eliminados=true`. Las casillas usan el atributo HTML `form="formLote"` para enviarse con un formulario que está fuera de la tabla, y `POST /clientes/lote` sirve a la vez al botón de una fila, a la selección múltiple y a «Restaurar». El servicio (`cambiarPapeleraVarios`) lo hace todo en una transacción y omite sin fallar los clientes que ya estaban en ese estado. Cambio típico en directo: subir `MAX_LOTE` o mostrar el número de clientes omitidos en el mensaje.

**¿Por qué en el listado no se pide el CIF para eliminar?** Mover a la papelera es reversible, así que basta una confirmación; en la ficha se mantiene el CIF como segunda verificación. Si se prefiriera lo contrario, es un cambio en `listado.njk` y en la ruta `/clientes/lote`.

**¿Por qué el dígito de control del CIF es solo un aviso?** Varios CIF del Excel de ejemplo no lo cumplen. Bloquear habría rechazado casi toda la importación.

**¿Cómo se trata el Excel?** Hay normalización por campo (`src/importacion/normalizar.js`) y un plan por fila (`planificar.js`) que decide: importada, duplicada, rechazada o pendiente. Solo se fusionan clientes con el mismo CIF normalizado; lo dudoso queda pendiente. El informe incluye un cuadre de importes que debe dar diferencia 0. Repetir la importación no duplica nada.

**¿Qué pasa si dos personas editan a la vez?** La fila se bloquea durante el cambio (`FOR UPDATE`), así que no se mezclan, pero gana el último que guarda. Es una limitación conocida: la mejora sería un control de versiones por cliente.

**¿Cómo se evitan los ataques habituales?**
- *Inyección SQL:* consultas siempre con parámetros; el orden solo admite una lista cerrada de columnas.
- *XSS:* Nunjucks escapa todo el texto, y la política de contenido (CSP) no permite scripts ni estilos en línea.
- *CSRF:* cookie `SameSite=Lax` más comprobación del origen en los envíos.
- *Contraseñas y sesiones:* hash `scrypt`, tokens guardados como hash, sesiones de 8 horas y 5 intentos de login cada 15 minutos.

**¿Qué has usado de IA?** Está documentado en `docs/IA.md`. Ten claro qué parte revisaste, probaste o cambiaste tú.

## Cambios que pueden pedirte, y dónde tocar

| Cambio | Dónde |
|---|---|
| Añadir un campo al cliente (por ejemplo, web) | Migración nueva (`migraciones/004_...sql`), `COLUMNAS`, `aCliente` y consultas de `src/repositorios/clientes.js`, `src/validacion/cliente.js`, `CAMPOS_CLIENTE` en `src/servicios/clientes.js`, `formulario.njk` y `ficha.njk`, etiqueta en `src/vistas/filtros.js`, y un test |
| Añadir un filtro al listado (por ejemplo, ciudad) | `validarFiltros` en `src/validacion/cliente.js`, la consulta de `listar` en `src/repositorios/clientes.js`, `PARAMETROS` en `src/routes/web/clientes.js` y `listado.njk` |
| Que la facturación acumulada incluya el IVA | La consulta de `src/repositorios/clientes.js`: cambiar la suma de `base_imponible` por la de `total` |
| Cambiar los clientes por página por defecto | `porPaginaPorDefecto` en `listar` de `src/servicios/clientes.js` y las opciones de `listado.njk` |
| Cambiar la duración de la sesión | `HORAS_SESION` en `src/servicios/autenticacion.js` |
| Cambiar el límite de intentos de login | Valores por defecto de `src/seguridad/limitadorIntentos.js` |
| Cambiar una regla de fechas o importes del Excel | `src/importacion/normalizar.js` y su test |
| Cambiar los textos de la ayuda | `src/vistas/ayuda.njk` |

Método para cualquier cambio: localiza el punto con una búsqueda del nombre del campo en todo el proyecto, cámbialo, ejecuta `npm test` y mira qué tests fallan: te dicen qué más depende de eso.

## Con más tiempo

Pantalla de revisión manual de la importación, SSO y verificación en dos pasos, roles, alta y edición de facturas, control de ediciones simultáneas, copias de seguridad programadas y HTTPS. Están recogidas en el README.
