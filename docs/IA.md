# Uso de herramientas de IA

**Herramienta:** Claude (Anthropic), mediante conversación de chat.

**Uso:** análisis de los requisitos y de los datos de partida, comparación de alternativas tecnológicas, planificación del trabajo y apoyo en la escritura del código, los tests y la documentación.

## Resumen de los prompts principales

1. **Planteamiento.** Se aportan los requisitos y el CSV, y se pide una solución robusta, segura y ampliable, con interfaz responsive de estilo habitual y documentación para personas sin conocimientos técnicos. Antes de empezar se pide valorar si la solución es adecuada y qué aspectos de CRM, facturación y factura electrónica conviene tener en cuenta.
2. **Tecnología.** Se contrasta la elección de JavaScript con Node.js, el framework web y el enfoque de la interfaz (React frente a páginas servidas por el backend).
3. **Análisis de los datos.** Se revisa el CSV antes de diseñar: formatos mezclados de fechas e importes, clientes duplicados con distinto nombre o CIF, facturas repetidas o incompletas y CIF que no cumplen el dígito de control.
4. **Decisiones previas.** Se resuelven una a una las decisiones no evidentes: duplicados, filas inválidas, facturas repetidas, borrado lógico, usuarios y acceso, facturas, CIF, idioma y manual de usuario.
5. **Plan.** Se elabora y revisa un plan por pasos antes de escribir código.
6. **Construcción.** Se desarrolla por etapas, con un commit por etapa: esquema y migraciones, importador, acceso seguro, servicio y API de clientes, interfaz web (listado, ficha, formularios, papelera y ayuda), arranque con Docker y documentación. Cada etapa se comprueba con tests automáticos y con la base de datos real.

## Verificación

El código está cubierto por tests automáticos (`npm test`) que se ejecutan contra una base de datos PostgreSQL temporal. Las decisiones técnicas y de datos están razonadas en [`decisiones.md`](decisiones.md).
