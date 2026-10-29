# Decisiones técnicas y de datos

Cada decisión indica qué se ha elegido y por qué. Lo que los requisitos no especifican se decide aquí.

## Tecnología

| Tema | Decisión | Motivo |
|---|---|---|
| Lenguaje | JavaScript con Node.js, sin TypeScript | Menos piezas y sin fase de compilación; la validación se hace de forma explícita |
| Framework | Express 5 | El más extendido y documentado, con un ecosistema de middleware maduro |
| Acceso a datos | SQL directo con `pg`, sin ORM | SQL explícito y siempre parametrizado, sin capa intermedia entre el código y la base de datos |
| Interfaz | HTML generado en el servidor (Nunjucks), htmx y Bootstrap 5 | Un solo proyecto, sin fase de compilación del front y aspecto de panel de administración responsive |
| Idioma | Tablas, rutas y comentarios en español; términos técnicos en inglés | Coincide con el idioma del negocio y de las fuentes de datos |

## Datos e importación

| Tema | Decisión |
|---|---|
| Duplicados | Solo se fusionan clientes con el mismo CIF tras normalizar mayúsculas, espacios y guiones. Sin CIF no se fusiona nada automáticamente: la fila queda pendiente de revisión |
| Resultado de cada fila | Importada, duplicada, rechazada o pendiente de revisión. Todas quedan registradas con su fila original |
| Factura repetida | Si es idéntica, se guarda una y la otra se anota en el informe. Si el número coincide pero los datos no, no se importa ninguna y pasan a revisión |
| Filas inválidas | Se rechazan y se listan en el informe. No se inventan datos |
| Fechas | Se interpretan como día/mes/año; los años de dos cifras como 20xx. Una fecha que no existe se rechaza, no se corrige |
| Importes | Un punto seguido de exactamente tres cifras (sin coma) es separador de miles: `1.250` es 1250. En los demás casos es decimal: `640.5` es 640,50. Un importe negativo es válido: es un abono o una rectificativa |
| Avisos e informe de cuadre | Las interpretaciones dudosas (años de dos cifras, importes con punto decimal) se importan y se listan como avisos. El informe incluye un cuadre: suma de bases del fichero frente a importadas, rechazadas y pendientes |
| Filas sin factura | Si los cuatro campos de factura están vacíos, la fila solo describe al cliente (caso Atelier Lumière) y se importa sin facturas |
| Datos distintos en un mismo cliente | Se mantiene la primera fila y las demás dejan un aviso (nombre de empresa, país, estado, comercial, fecha de alta o teléfono distintos) |
| Normalización | Tildes y mayúsculas no cuentan al comparar. Ciudad y comercial en mayúsculas o minúsculas se pasan a formato nombre propio. Los emails se guardan en minúsculas |
| Repetir la importación | No duplica nada: se detecta por CIF y por número de factura. Al arrancar solo se importa si nunca se había importado (`IMPORTAR_AL_ARRANCAR`) |
| Transacción | Cada importación es atómica: o se guarda todo o nada. Un CSV con formato incorrecto (separador, codificación, columnas) se rechaza entero con un mensaje claro |
| CIF/NIF | El formato es obligatorio y debe corresponder al país del cliente (un IVA portugués no vale para un cliente español); un CIF con formato inválido rechaza la fila. El dígito de control de los españoles es solo un aviso (una vez por cliente), porque varios CIF de ejemplo no lo cumplen. En el extranjero se comprueba solo el formato por país |

## Modelo y funcionamiento

| Tema | Decisión |
|---|---|
| Facturas | Solo lectura. Número único. El total lo calcula PostgreSQL a partir de la base y el IVA. Una base negativa (abono o rectificativa) se guarda tal cual: el total y la facturación acumulada la restan, y la ficha la marca con una etiqueta |
| Facturación acumulada | Se calcula al consultar (suma de bases imponibles), no se guarda: así nunca queda desactualizada y no duplica un dato que ya existe. Si el volumen creciera mucho, se pasaría a una columna mantenida por la base de datos sin cambiar la API |
| Eliminar cliente | Borrado lógico («papelera»): el cliente se oculta, no se borra nada y se puede restaurar |
| Registro de eventos | `src/registro.js`. En producción, una línea JSON por evento; en desarrollo, texto legible; en los tests, nada. Nunca se registran datos personales ni parámetros de la URL |
| Histórico | Lo registra la capa de servicio dentro de la misma transacción que el cambio. Incluye altas, ediciones, envíos a la papelera (acción `baja`) y restauraciones |
| Acceso | Login con email y contraseña (hash scrypt con sal propia), sesiones guardadas en PostgreSQL (solo el hash del token), cookie para la web y token Bearer para la API. Un solo rol por ahora, con la columna preparada para más |

## Interfaz web

| Tema | Decisión |
|---|---|
| Tecnología | Páginas HTML generadas en el servidor (Nunjucks) con htmx para actualizar el listado sin recargar y Bootstrap 5 para un aspecto de panel de administración, responsive. Sin fase de compilación ni segundo proyecto |
| Sin CDN | Bootstrap, iconos y htmx se sirven desde `node_modules`: funciona sin internet y permite una política CSP estricta |
| CSP | `default-src 'self'`: sin scripts, estilos ni manejadores en línea (hay un test que lo vigila). htmx se configura sin `eval` ni estilos incrustados |
| Sesión web | Cookie `HttpOnly` + `SameSite=Lax`; con HTTPS (`COOKIE_SECURE=true`) pasa a `Secure` con prefijo `__Host-`. Una sesión web y un token de API no son intercambiables |
| CSRF | `SameSite=Lax` más comprobación de `Origin` y `Sec-Fetch-Site` en todo POST. Si la aplicación va detrás de un proxy, este debe conservar la cabecera `Host` original |
| Listado | La URL refleja búsqueda, filtros, orden y página: se puede copiar, recargar y volver atrás. Con JavaScript se pide solo la tabla; sin él, pulsar Intro en el cuadro de búsqueda envía el formulario normal |
| Filtros inválidos en la URL | Se ignoran con un aviso en lugar de mostrar un error |
| Errores | Las páginas muestran un mensaje amable sin detalles técnicos; la API sigue devolviendo JSON |
| Ficha | Datos y facturación acumulada, y pestañas Contactos, Facturas e Histórico de cambios (de 20 en 20). La pestaña abierta se refleja en la URL (`#facturas`), de modo que se puede enlazar |
| Formularios | El alta lleva un primer contacto obligatorio; los demás se añaden desde la ficha. Cliente y contactos se editan por separado. Los errores salen junto a cada campo y se conserva lo escrito. Solo llevan texto de ayuda los campos con un formato concreto (CIF, email) |
| Enviar y redirigir | Tras guardar se redirige a la ficha (303), para que recargar la página no repita el envío. Los mensajes se piden por clave (`?ok=creado`): nunca se muestra texto que venga de la dirección |
| Papelera (ficha) | Doble verificación: ventana de confirmación y escribir el CIF del cliente. El servidor lo vuelve a comprobar, porque el navegador puede no tener JavaScript. Restaurar no pide confirmación porque no destruye nada |
| Papelera (listado) | Pestañas Clientes \| Papelera como enlaces normales, sin botón de búsqueda: el filtro se aplica al escribir. Botón de papelera en cada fila y selección múltiple (hasta 100) con una sola confirmación, sin escribir el CIF porque es reversible. Todo va por `POST /clientes/lote`, en una transacción: o se mueven todos o ninguno, y los que ya estaban en ese estado se omiten |
| Aviso del CIF | La ficha avisa mientras el dígito de control del CIF español no cuadre. Nunca bloquea |
| Facturas | Solo consulta, también en la web |
| Ayuda | Página `/ayuda` en lenguaje no técnico, enlazada desde el menú |

## API de clientes

| Tema | Decisión |
|---|---|
| Capas | Ruta (HTTP) → servicio (reglas) → repositorio (SQL). La ruta no tiene lógica y el servicio no sabe nada de HTTP, así que la API y la interfaz web comparten el mismo servicio |
| Validación | Escrita a mano en `src/validacion/`, con los mismos normalizadores que el importador. Devuelve **todos** los errores a la vez, por campo (`detalles`), con mensajes neutros |
| Modificar (PUT) | Solo cambian los campos enviados; `null` vacía un campo opcional. Si nada cambia realmente, no se escribe ni se anota nada |
| Transacciones | Cada alta, cambio, envío a la papelera o restauración se guarda junto a su histórico en una transacción. La fila del cliente se bloquea mientras se edita para evitar cambios simultáneos |
| Histórico | Una fila por campo cambiado, con `registro` legible ("Cliente: ...", "Contacto: ..."), valor anterior y nuevo, usuario y fecha. El comercial se anota por nombre, no por id |
| Papelera | Borrado lógico (`DELETE` → 204). Un cliente en la papelera no se puede modificar hasta restaurarlo (`POST /restaurar`); su ficha sigue consultable. La selección múltiple es solo de la web; la API sigue siendo de uno en uno |
| Contactos | Endpoints propios; un cliente debe conservar al menos un contacto; el email no se repite dentro de un cliente |
| Búsqueda | Sin distinguir mayúsculas ni tildes (extensión `unaccent` de PostgreSQL). `%` y `_` se buscan como texto |
| Orden | Solo columnas permitidas (lista cerrada); nunca se concatena texto del usuario en el SQL |
| Paginación | `pagina` y `porPagina` (10 por defecto, máximo 100) con `total` y `totalPaginas` |
| Campos no editables | `id`, fechas de control y `eliminadoEn` se ignoran si llegan en el cuerpo |
| Códigos HTTP | 200/201/204 correctos, 400 datos inválidos, 401 sin token, 404 no existe, 409 conflicto (CIF o email repetido, cliente en la papelera) |

## Seguridad

| Tema | Decisión |
|---|---|
| API cerrada por defecto | Todo lo que cuelga de `/api` exige token salvo el login; sin token, incluso una ruta inexistente responde 401 |
| Caducidad | Las sesiones duran 8 horas; las caducadas se limpian en cada login |
| Errores de login | Mismo mensaje y mismo tiempo de respuesta para "no existe", "clave mala" y "usuario desactivado", para no revelar qué emails existen |
| Fuerza bruta | 5 fallos por origen y email bloquean 15 minutos, aunque luego se acierte. Está en memoria: vale para una instancia; con varias habría que moverlo a la base de datos |
| Administrador inicial | Se crea con `ADMIN_EMAIL` y `ADMIN_PASSWORD` solo si no hay usuarios. Sin contraseña, se genera una aleatoria y se muestra una sola vez en el log. Ninguna contraseña está en el repositorio |
| Entrada | Los cuerpos JSON se limitan a 100 KB; se comprueba el tipo y la longitud de lo recibido; el SQL va siempre con parámetros |
| Cabeceras | `nosniff`, `X-Frame-Options`, política de referer y `no-store`. La política CSP, la cookie de sesión web y la protección CSRF se describen en «Interfaz web» |
| Ids | Se devuelven como número; los importes como texto con dos decimales para no perder precisión |

## Esquema de base de datos

| Tema | Decisión |
|---|---|
| Migraciones | Ficheros `.sql` numerados en `migraciones/`, aplicados una vez y en orden al arrancar (o con `npm run migrar`). Cada uno va en una transacción y con bloqueo, para que dos arranques simultáneos no choquen. Los cambios futuros son migraciones nuevas, nunca se edita una ya publicada |
| Comerciales | Tabla propia: evita variantes de escritura y alimenta el filtro |
| CIF | Único en toda la tabla, también entre clientes de la papelera: un cliente eliminado se restaura, no se duplica |
| Código postal | Texto |
| Fecha de última modificación | La actualiza la base de datos con un trigger, también cuando cambia un contacto |
| Histórico | Una fila por campo modificado, con copia del email del usuario. Se escribe desde la capa de servicio en la misma transacción que el cambio |
| Informe de importación | Tablas `importaciones` e `importacion_filas`, con la fila original, el resultado, el motivo y los avisos |
| Sesiones | Se guarda el hash del token, no el token |

## Para más adelante

- Pantalla de revisión manual de las filas pendientes de la importación.
- Acceso con SSO (OIDC) y verificación en dos pasos.
- Cambio de contraseña desde la aplicación y alta de más usuarios.
- Varios roles, por ejemplo comercial con acceso solo a sus clientes.
- Alta y edición de facturas con series, rectificativas y estado de cobro.
- Página con el informe de cada importación (filas rechazadas, pendientes y avisos), hoy solo en la base de datos.
