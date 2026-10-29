// Comportamientos mínimos de la interfaz, sin dependencias.
//
// 1. Ficha: papelera con doble verificación.
// 2. Listado: selección múltiple y ventanas de confirmación.
// 3. Ficha: pestañas que se pueden enlazar (#contactos, #facturas, #historico).
//
// Papelera con doble verificación: el botón de confirmar solo se activa cuando
// se escribe el CIF del cliente. Es una ayuda para quien usa la web: sin
// JavaScript el botón sigue activo y es el servidor quien comprueba el CIF.

const limpiar = (texto) => texto.replace(/[\s.-]/g, '').toUpperCase();

document.querySelectorAll('form[data-doble-confirmacion]').forEach((formulario) => {
  const campo = formulario.querySelector('input[data-confirmar]');
  const boton = formulario.querySelector('button[type="submit"]');
  const comprobar = () => {
    boton.disabled = limpiar(campo.value) !== limpiar(campo.dataset.confirmar);
  };

  campo.addEventListener('input', comprobar);
  // Al cerrar la ventana se vacía lo escrito, para que no quede el botón activo.
  formulario.closest('.modal')?.addEventListener('hidden.bs.modal', () => {
    campo.value = '';
    comprobar();
  });
  comprobar();
});

// ---------------------------------------------------------------------------
// Listado: selección múltiple y ventanas de confirmación
//
// La tabla se vuelve a pintar entera cada vez que htmx aplica un filtro o
// cambia de página. Por eso los eventos se escuchan en el documento
// (delegación) y no en cada casilla: así siguen funcionando tras cada cambio.
// Sin JavaScript todo sigue siendo usable salvo la selección múltiple.
// ---------------------------------------------------------------------------

const casillasDeFila = () => document.querySelectorAll('input[data-fila]');
const casillasMarcadas = () => document.querySelectorAll('input[data-fila]:checked');

/** Muestra la barra de acciones solo si hay algo seleccionado y ajusta la casilla de "seleccionar todo". */
function actualizarSeleccion() {
  const barra = document.querySelector('[data-barra-lote]');
  if (!barra) return;
  const marcadas = casillasMarcadas().length;
  const total = casillasDeFila().length;

  barra.hidden = marcadas === 0;
  barra.querySelector('[data-cuenta]').textContent = marcadas;

  const todas = document.querySelector('input[data-seleccionar-todo]');
  if (todas) {
    todas.checked = total > 0 && marcadas === total;
    todas.indeterminate = marcadas > 0 && marcadas < total; // estado intermedio: solo algunas
  }
}

document.addEventListener('change', (evento) => {
  if (evento.target.matches('input[data-seleccionar-todo]')) {
    casillasDeFila().forEach((casilla) => { casilla.checked = evento.target.checked; });
    actualizarSeleccion();
  } else if (evento.target.matches('input[data-fila]')) {
    actualizarSeleccion();
  }
});

// El navegador puede recordar casillas marcadas al volver atrás: se recalcula la barra.
window.addEventListener('pageshow', actualizarSeleccion);
document.addEventListener('htmx:afterSwap', actualizarSeleccion);

// Antes de abrir una ventana de confirmación se rellena con los datos de la fila pulsada.
document.addEventListener('show.bs.modal', (evento) => {
  const ventana = evento.target;
  if (ventana.id === 'modalEliminar') {
    const fila = evento.relatedTarget?.dataset ?? {};
    ventana.querySelector('[data-id-cliente]').value = fila.id ?? '';
    ventana.querySelector('[data-nombre-cliente]').textContent = fila.empresa ?? '';
  }
  if (ventana.id === 'modalLote') {
    ventana.querySelector('[data-cuenta-lote]').textContent = casillasMarcadas().length;
  }
});

// ---------------------------------------------------------------------------
// Ficha: pestañas enlazables
//
// Bootstrap cambia de pestaña al pulsarla. Aquí solo se añade que la dirección
// recuerde cuál está abierta (para recargar o compartir el enlace) y que al
// entrar con #historico, #facturas o #contactos se abra la pestaña indicada.
// ---------------------------------------------------------------------------

const botonesPestana = [...document.querySelectorAll('[data-bs-toggle="tab"]')];
if (botonesPestana.length > 0) {
  // Se compara texto con texto (sin construir un selector con lo que venga en la dirección).
  const pedido = botonesPestana.find((boton) => boton.dataset.bsTarget === location.hash);
  if (pedido) window.bootstrap.Tab.getOrCreateInstance(pedido).show();

  document.addEventListener('shown.bs.tab', (evento) => {
    history.replaceState(null, '', `${location.pathname}${location.search}${evento.target.dataset.bsTarget}`);
  });
}
