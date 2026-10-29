# Manual de usuario

Este manual explica cómo usar la aplicación de gestión de clientes. No hace falta ningún conocimiento técnico. Dentro de la aplicación tienes además una página **Ayuda** (en el menú superior) con las dudas más habituales.

## Para qué sirve

Aquí se guardan los clientes de la empresa, las personas de contacto de cada uno y sus facturas. Sustituye al Excel compartido: ahora todo el mundo ve los mismos datos actualizados y la aplicación apunta quién cambia qué y cuándo.

## Entrar y salir

1. Abre la dirección de la aplicación en tu navegador.
2. Escribe tu correo electrónico y tu contraseña, y pulsa **Entrar**.
3. Para salir, pulsa **Salir** arriba a la derecha. Hazlo siempre si usas un ordenador compartido.

Si te equivocas cinco veces seguidas, la aplicación bloquea los intentos durante unos 15 minutos por seguridad. Espera y vuelve a probar. Si has olvidado la contraseña, pídele a la persona que administra la aplicación que te la restablezca.

## El listado de clientes

Al entrar verás la lista de clientes con su empresa, CIF, ciudad, contacto, país, comercial, estado y facturación acumulada.

### Buscar y filtrar

- **Buscar:** escribe en el cuadro parte del nombre de la empresa, de un contacto, un CIF o un correo. La lista se actualiza sola mientras escribes. No importan las mayúsculas ni las tildes: «clinica» encuentra «Clínica».
- **Filtros:** con los desplegables puedes quedarte solo con un estado (Activo o Inactivo), un país o un comercial.
- **Limpiar filtros:** quita la búsqueda y todos los filtros.
- **Papelera:** la pestaña **Papelera**, junto a **Clientes**, muestra los clientes que has eliminado (mira más abajo «Eliminar y restaurar clientes»).

### Ordenar y cambiar de página

- Pulsa el título de una columna (Empresa, País, Estado, Facturación, Modificado) para ordenar por ella. Si vuelves a pulsarla, se invierte el orden.
- Abajo tienes los números de página y cuántos clientes hay en total. A la derecha del cuadro de búsqueda puedes elegir cuántos clientes ver por página.

## La ficha de un cliente

Pulsa el nombre de una empresa (o el icono del ojo) para abrir su ficha. Contiene:

- **Datos del cliente:** dirección, país, comercial, fecha de alta y última modificación.
- **Facturación acumulada:** la suma de las bases imponibles de todas sus facturas, **sin IVA**.

Debajo hay tres pestañas:

- **Contactos:** las personas de la empresa, con su correo y teléfono.
- **Facturas:** número, fecha, base imponible, IVA y total. Son solo de consulta: no se pueden crear ni modificar desde aquí. Un importe negativo es un abono o una rectificativa y se marca con una etiqueta.
- **Histórico de cambios:** quién cambió qué, cuándo, y el valor anterior y el nuevo.

## Crear un cliente

1. En el listado, pulsa **Nuevo cliente**.
2. Rellena los datos de la empresa. Los campos con asterisco (*) son obligatorios. Los campos con un formato concreto, como el CIF o el correo, llevan debajo una indicación de qué escribir.
3. Rellena el **contacto principal**: todo cliente necesita al menos una persona de contacto.
4. Pulsa **Crear cliente**.

Si algo no es válido, la aplicación te dice qué campo hay que corregir, en rojo y junto al campo. No se pierde lo que ya habías escrito.

**Sobre el CIF:** en España son una letra y números (por ejemplo B50123456). En otros países, el número de IVA con su prefijo (por ejemplo PT509876543). Si el CIF español tiene el último carácter mal, la aplicación solo te avisa: guarda el cliente igualmente, pero conviene revisarlo con una factura del cliente.

## Modificar un cliente

1. Abre la ficha y pulsa **Editar** (o el icono del lápiz en el listado).
2. Cambia lo que necesites y pulsa **Guardar cambios**.

Cada cambio queda anotado en el histórico, con la fecha y tu usuario.

## Añadir, modificar o eliminar contactos

En la ficha, dentro de la pestaña **Contactos**:

- **Añadir contacto:** pulsa el botón, rellena nombre y correo (el teléfono es opcional) y guarda.
- **Modificar:** pulsa el lápiz junto al contacto.
- **Eliminar:** pulsa la papelera y confirma. Un cliente siempre debe conservar **al menos un contacto**, así que el último no se puede eliminar.

Un mismo correo no puede repetirse dentro del mismo cliente.

## Eliminar y restaurar clientes (la papelera)

**Eliminar no borra nada.** Un cliente eliminado pasa a la **papelera**: deja de aparecer en el listado normal, pero conserva sus contactos, facturas e histórico.

Para mover un cliente a la papelera, tienes tres formas:

- **Desde el listado:** pulsa el icono de la papelera de su fila y confirma.
- **Varios a la vez:** marca las casillas de la izquierda (la casilla de la cabecera marca todos los de la página) y pulsa **Mover a la papelera** en la barra que aparece. La selección vale solo para la página que ves.
- **Desde su ficha:** pulsa **Mover a la papelera** y, como medida de seguridad, escribe el CIF del cliente para confirmar.

Para recuperarlos:

1. Abre la pestaña **Papelera** (el número indica cuántos clientes hay).
2. Pulsa el icono de restaurar en su fila, o marca varios y pulsa **Restaurar seleccionados**. También puedes abrir su ficha y pulsar **Restaurar cliente**.

Un cliente que está en la papelera no se puede modificar hasta que se restaura.

## El histórico de cambios

En la pestaña **Histórico de cambios** de cada ficha verás una tabla con todo lo que ha ocurrido con ese cliente: altas, modificaciones, movimientos a la papelera y restauraciones, tanto de la empresa como de sus contactos. Cada fila indica la fecha y hora, la persona, la acción y un detalle: qué se tocó y, si se modificó un dato, el valor anterior (tachado) y el nuevo. Sirve para aclarar dudas como «¿quién cambió este teléfono?». No se puede editar ni borrar.

Si hay muchos cambios, se muestran de 20 en 20, con botones para ver los más antiguos.

## Mensajes que puedes encontrar

| Mensaje | Qué significa y qué hacer |
|---|---|
| «Campo obligatorio» | Falta un dato que hay que rellenar |
| «Ya existe un cliente con ese CIF» | Esa empresa ya está en la aplicación, quizá en la papelera. Búscala en la pestaña Papelera y restáurala en vez de crearla de nuevo |
| «Ya existe un contacto con ese email» | Ese correo ya está en el mismo cliente |
| «El dígito de control del CIF no parece correcto» | Es solo un aviso. Revisa el CIF con una factura del cliente |
| «El CIF escrito no coincide» | Al mover un cliente a la papelera desde su ficha, el CIF escrito no es el del cliente. No se ha movido |
| «Un cliente debe conservar al menos un contacto» | No se puede eliminar el único contacto de un cliente. Añade otro antes |
| «La página que buscas no existe» | La dirección no es correcta. Vuelve al listado de clientes |
| Te lleva a la pantalla de entrada | La sesión ha caducado (dura 8 horas). Vuelve a entrar |

## Preguntas frecuentes

**¿Por qué no puedo modificar una factura?**
Las facturas proceden del Excel anterior y son solo de consulta.

**¿Por qué un cliente tiene menos facturas que en el Excel?**
Al importar el Excel, algunas filas tenían datos incorrectos (por ejemplo una fecha que no existe) o dudosos (un cliente sin CIF). La aplicación no los inventa ni los adivina: quedan pendientes de revisión con quien administra la aplicación.

**¿La facturación acumulada incluye el IVA?**
No: es la suma de las bases imponibles.

**¿Se puede recuperar un cliente que eliminé por error?**
Sí, siempre: está en la pestaña Papelera. Mira el apartado «Eliminar y restaurar clientes».

**¿Quién ve mis cambios?**
Las personas que usan la aplicación ven los datos actualizados, y el histórico muestra el usuario que hizo cada cambio.

**Algo no funciona como aquí se explica.**
Avisa a la persona que administra la aplicación, indicando qué hacías y qué mensaje apareció.

## Glosario

- **CIF/NIF:** identificador fiscal de la empresa. En otros países, su número de IVA.
- **Base imponible:** importe de una factura antes de añadir el IVA.
- **Facturación acumulada:** suma de las bases imponibles de todas las facturas de un cliente.
- **Papelera:** donde van los clientes eliminados. No se borra nada y se pueden restaurar.
- **Histórico:** registro de quién cambió qué y cuándo.
