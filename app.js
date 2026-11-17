const formReporte = document.getElementById('form-incidencia');
const campoTitulo = document.getElementById('titulo');
const campoDetalle = document.getElementById('descripcion');
const contenedorBandeja = document.getElementById('lista-outbox');
const botonLimpiar = document.getElementById('btn-purgar');
const badgeEstadoRed = document.getElementById('badge-red');

const ENDPOINT_API = 'https://jsonplaceholder.typicode.com/posts';

function procesarEnvioReporte(datos) {
  const payload = {
    title: datos.titulo,
    body: datos.descripcion
  };

  return fetch(ENDPOINT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return respuesta.json();
    })
    .then(() => {
      return guardarRegistro({
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        estado: 'sincronizado',
        fechaCreacion: Date.now()
      });
    })
    .catch(() => {
      // Si falla la red, guardamos el reporte localmente en IndexedDB como pendiente
      console.warn('[App] Sin conexión. Guardando localmente...');

      return guardarRegistro({
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        estado: 'pendiente',
        fechaCreacion: Date.now()
      })
        .then(() => {
          // Si el navegador soporta Background Sync, le delegamos la tarea al sw
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            return navigator.serviceWorker.ready.then((swReg) => {
              console.log('[App] Registrando tarea de sync en sw: sync-reportes');
              return swReg.sync.register('sync-reportes');
            });
          }
        });
    })
    .then(() => {
      return renderizarColaOutbox();
    });
}

// Fallback para navegadores que no soportan Background Sync (ej. Safari en iOS)
function sincronizarPendientesFallback() {
  console.log('[App] Conexión detectada. Ejecutando sincronización de respaldo...');

  return obtenerTodosLosRegistros()
    .then((registros) => {
      const pendientes = registros.filter((item) => item.estado === 'pendiente');

      if (pendientes.length === 0) return;

      const promesasDeEnvio = pendientes.map((item) => {
        return fetch(ENDPOINT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.titulo,
            body: item.descripcion
          })
        })
          .then((res) => {
            if (!res.ok) throw new Error('Error al reintentar');
            return actualizarEstadoRegistro(item.id, 'sincronizado');
          });
      });

      return Promise.all(promesasDeEnvio);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error('[App] Error al sincronizar pendientes fallback:', error);
    });
}

function actualizarEstadoConexion() {
  const hayRed = navigator.onLine;
  badgeEstadoRed.textContent = hayRed ? 'En Línea' : 'Sin Conexión';
  badgeEstadoRed.className = `badge ${hayRed ? 'online' : 'offline'}`;
}

function construirItemReporte(item) {
  const li = document.createElement('li');
  li.className = 'item-outbox';

  const contenedorTexto = document.createElement('div');
  contenedorTexto.className = 'item-info';

  const tituloEl = document.createElement('span');
  tituloEl.className = 'item-titulo';
  tituloEl.textContent = item.titulo;

  const descEl = document.createElement('span');
  descEl.className = 'item-descripcion';
  descEl.textContent = item.descripcion;

  const horaEl = document.createElement('span');
  horaEl.className = 'item-hora';
  const fechaTexto = new Date(item.fechaCreacion).toLocaleString();
  horaEl.textContent = `Registrado: ${fechaTexto} (ID: ${item.id})`;

  contenedorTexto.appendChild(tituloEl);
  contenedorTexto.appendChild(descEl);
  contenedorTexto.appendChild(horaEl);

  const etiquetaEstado = document.createElement('span');
  const esSincronizado = item.estado === 'sincronizado';
  etiquetaEstado.className = `estado-pill ${esSincronizado ? 'estado-sincronizado' : 'estado-pendiente'}`;
  etiquetaEstado.textContent = item.estado;

  li.appendChild(contenedorTexto);
  li.appendChild(etiquetaEstado);

  return li;
}

function renderizarColaOutbox() {
  return obtenerTodosLosRegistros()
    .then((registros) => {
      contenedorBandeja.innerHTML = '';

      if (registros.length === 0) {
        const filaVacia = document.createElement('li');
        filaVacia.className = 'estado-vacio';
        filaVacia.textContent = 'La bandeja de salida no contiene reportes.';
        contenedorBandeja.appendChild(filaVacia);
        return;
      }

      // Mostramos los más recientes arriba
      const ordenados = [...registros].reverse();
      ordenados.forEach((registro) => {
        contenedorBandeja.appendChild(construirItemReporte(registro));
      });
    })
    .catch((error) => {
      console.error('[App] Error al recuperar reportes:', error);
    });
}

function inicializarSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then((registro) => {
      console.log('[App] sw registrado con scope:', registro.scope);
    })
    .catch((error) => {
      console.error('[App] Error al registrar sw:', error);
    });

  // Cuando el sw termina de sincronizar en segundo plano, actualizamos la vista
  navigator.serviceWorker.addEventListener('message', (evento) => {
    if (evento.data && evento.data.tipo === 'OUTBOX_SINCRONIZADO') {
      renderizarColaOutbox();
    }
  });
}

formReporte.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const titulo = campoTitulo.value.trim();
  const descripcion = campoDetalle.value.trim();
  if (!titulo || !descripcion) return;

  procesarEnvioReporte({ titulo, descripcion })
    .then(() => {
      formReporte.reset();
      campoTitulo.focus();
    });
});

botonLimpiar.addEventListener('click', () => {
  obtenerTodosLosRegistros()
    .then((registros) => {
      // Filtramos solo los que ya fueron sincronizados para no borrar pendientes
      const aEliminar = registros.filter((r) => r.estado === 'sincronizado');
      if (aEliminar.length === 0) {
        alert('No hay reportes sincronizados por depurar.');
        return;
      }

      const operaciones = aEliminar.map((r) => eliminarRegistro(r.id));
      return Promise.all(operaciones);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error('[App] Error al limpiar registros:', error);
    });
});

window.addEventListener('online', () => {
  actualizarEstadoConexion();
  // Solo ejecutamos fallback si el navegador no tiene Background Sync
  if (!('SyncManager' in window)) {
    sincronizarPendientesFallback();
  }
});

window.addEventListener('offline', actualizarEstadoConexion);

document.addEventListener('DOMContentLoaded', () => {
  inicializarSW();
  actualizarEstadoConexion();
  renderizarColaOutbox();
});
