/* Pantalla 3 · Teleprompter. El guion vive solo en esta pestaña: no se guarda ni se envía. */
(function () {
  'use strict';
  var C = window.MMGComun;
  var el = C.el;

  var VEL_MIN = 60, VEL_MAX = 240, VEL_PASO = 5;
  var TAM_MIN = 24, TAM_MAX = 96, TAM_PASO = 4;
  var GUIA = 0.08;            // se lee pegado al margen superior, cerca de la cámara
  var OCULTAR_MS = 2500;      // la barra se esconde sola mientras se lee
  var MAX_ARCHIVO = 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };
  var ui = {
    texto: $('tp-texto'), resumen: $('tp-resumen'), archivo: $('tp-archivo'), limpiar: $('tp-limpiar'),
    vel: $('tp-velocidad'), velValor: $('tp-velocidad-valor'),
    tam: $('tp-tamano'), tamValor: $('tp-tamano-valor'),
    ancho: $('tp-ancho'), anchoValor: $('tp-ancho-valor'), anchoAyuda: $('tp-ancho-ayuda'),
    cuenta: $('tp-cuenta'), guia: $('tp-guia'), espejo: $('tp-espejo'),
    reproducir: $('tp-reproducir'), duracion: $('tp-duracion'), motivo: $('tp-motivo'),
    escena: $('tp-escena'), ventana: $('tp-ventana'), columna: $('tp-columna'),
    guiaLinea: $('tp-guia-linea'), cuentaNum: $('tp-cuenta-num'), progreso: $('tp-progreso'),
    barra: $('tp-barra'), bInicio: $('tp-b-inicio'), bLento: $('tp-b-lento'), bRapido: $('tp-b-rapido'),
    bPausa: $('tp-b-pausa'), bVel: $('tp-b-vel'), bTiempo: $('tp-b-tiempo'), bSalir: $('tp-b-salir')
  };

  var st = {
    estado: 'cerrado',        // cerrado | cuenta | reproduciendo | pausa | fin
    palabras: 0,
    offset: 0, max: 0, pxPorSeg: 0,
    raf: 0, ultimo: 0, timerCuenta: 0, timerBarra: 0,
    wakeLock: null
  };

  // ---------- Texto ----------
  function sinNotas(t) { return t.replace(/\[[^\]]*\]/g, ' '); }
  function contarPalabras(t) {
    var s = sinNotas(t).trim();
    return s ? s.split(/\s+/).length : 0;
  }
  function tiempo(seg) {
    seg = Math.max(0, Math.round(seg));
    var m = Math.floor(seg / 60), s = seg % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Párrafos separados por línea en blanco; [corchetes] = indicación. Siempre por textContent. */
  function renderizar(texto) {
    ui.columna.textContent = '';
    texto.replace(/\r\n?/g, '\n').split(/\n\s*\n/).forEach(function (bloque) {
      if (!bloque.trim()) return;
      var p = el('p', { class: 'tp-parrafo' });
      bloque.trim().split('\n').forEach(function (linea, i) {
        if (i) p.appendChild(document.createElement('br'));
        linea.split(/(\[[^\]]*\])/).forEach(function (trozo) {
          if (!trozo) return;
          if (/^\[[^\]]*\]$/.test(trozo)) p.appendChild(el('span', { class: 'tp-nota', text: trozo.slice(1, -1).trim() }));
          else p.appendChild(document.createTextNode(trozo));
        });
      });
      ui.columna.appendChild(p);
    });
  }

  // ---------- Ajustes ----------
  function vel() { return Number(ui.vel.value); }
  function tam() { return Number(ui.tam.value); }

  function actualizarFormulario() {
    st.palabras = contarPalabras(ui.texto.value);
    var hayTexto = st.palabras > 0;
    ui.velValor.textContent = vel() + ' palabras/min';
    ui.tamValor.textContent = tam() + ' px';
    ui.anchoValor.textContent = ui.ancho.value + ' %';
    ui.resumen.textContent = st.palabras === 1 ? '1 palabra' : C.numero(st.palabras) + ' palabras';
    ui.duracion.textContent = hayTexto ? 'Lectura estimada: ' + tiempo(st.palabras / vel() * 60) : '';
    ui.reproducir.disabled = !hayTexto;
    ui.motivo.hidden = hayTexto;
  }

  function aplicarEstilos() {
    var s = ui.escena.style;
    s.setProperty('--tp-tam', tam() + 'px');
    s.setProperty('--tp-ancho', ui.ancho.value + '%');
    // Las flechas apuntan al medio del renglón que se está leyendo (interlineado 1,5).
    s.setProperty('--tp-guia', 'calc(' + (GUIA * 100) + '% + ' + (tam() * 0.75) + 'px)');
    ui.escena.classList.toggle('tp-con-guia', ui.guia.checked);
    ui.escena.classList.toggle('tp-espejo', ui.espejo.checked);
  }

  /** Recalcula la velocidad en px/s para leer N palabras por minuto con la letra y el ancho actuales. */
  function medir(conservarProgreso) {
    var ratio = st.max ? st.offset / st.max : 0;
    // El final es cuando la última línea terminó de esconderse por arriba de la pantalla.
    st.max = ui.columna.offsetHeight + ui.ventana.clientHeight * GUIA;
    st.pxPorSeg = st.palabras ? ui.columna.offsetHeight * vel() / (st.palabras * 60) : 0;
    if (conservarProgreso) st.offset = ratio * st.max;
    pintar();
  }

  function pintar() {
    var y = ui.ventana.clientHeight * GUIA - st.offset;
    ui.columna.style.transform = 'translate3d(-50%,' + y.toFixed(2) + 'px,0)' + (ui.espejo.checked ? ' scaleX(-1)' : '');
    ui.progreso.style.transform = 'scaleX(' + (st.max ? Math.min(1, st.offset / st.max) : 0).toFixed(4) + ')';
    ui.bTiempo.textContent = st.pxPorSeg ? '−' + tiempo((st.max - st.offset) / st.pxPorSeg) : '0:00';
  }

  // ---------- Reproducción ----------
  function setEstado(e) {
    st.estado = e;
    ui.escena.setAttribute('data-estado', e);
    var corriendo = e === 'reproduciendo';
    ui.bPausa.setAttribute('aria-label', corriendo ? 'Pausa' : (e === 'fin' ? 'Empezar de nuevo' : 'Seguir'));
    mostrarBarra();
  }

  function cuadro(ts) {
    if (st.estado !== 'reproduciendo') return;
    var dt = st.ultimo ? Math.min(0.1, (ts - st.ultimo) / 1000) : 0;
    st.ultimo = ts;
    st.offset += st.pxPorSeg * dt;
    if (st.offset >= st.max) {
      st.offset = st.max;
      pintar();
      setEstado('fin');
      return;
    }
    pintar();
    st.raf = requestAnimationFrame(cuadro);
  }

  function reproducir() {
    if (st.estado === 'fin') st.offset = 0;
    cancelAnimationFrame(st.raf);
    st.ultimo = 0;
    setEstado('reproduciendo');
    st.raf = requestAnimationFrame(cuadro);
  }

  function pausar() {
    cancelAnimationFrame(st.raf);
    setEstado('pausa');
  }

  function alternar() {
    if (st.estado === 'reproduciendo') pausar();
    else if (st.estado === 'pausa' || st.estado === 'fin') reproducir();
  }

  function cuentaRegresiva() {
    var n = 3;
    setEstado('cuenta');
    ui.cuentaNum.hidden = false;
    ui.cuentaNum.textContent = n;
    st.timerCuenta = setInterval(function () {
      n -= 1;
      if (n > 0) { ui.cuentaNum.textContent = n; return; }
      clearInterval(st.timerCuenta);
      ui.cuentaNum.hidden = true;
      reproducir();
    }, 1000);
  }

  function cancelarCuenta() {
    clearInterval(st.timerCuenta);
    ui.cuentaNum.hidden = true;
  }

  function mover(px) {
    st.offset = Math.max(0, Math.min(st.max, st.offset + px));
    if (st.estado === 'fin' && st.offset < st.max) setEstado('pausa');
    pintar();
  }

  function cambiarVel(delta) {
    ui.vel.value = Math.max(VEL_MIN, Math.min(VEL_MAX, vel() + delta));
    ui.bVel.textContent = vel() + ' ppm';
    actualizarFormulario();
    medir(true);
    mostrarBarra();
  }

  function cambiarTam(delta) {
    ui.tam.value = Math.max(TAM_MIN, Math.min(TAM_MAX, tam() + delta));
    actualizarFormulario();
    aplicarEstilos();
    medir(true);
    mostrarBarra();
  }

  function alturaLinea() { return tam() * 1.5; }

  // ---------- Barra que se esconde sola ----------
  function mostrarBarra() {
    ui.escena.classList.remove('tp-quieto');
    clearTimeout(st.timerBarra);
    if (st.estado === 'reproduciendo') {
      st.timerBarra = setTimeout(function () { ui.escena.classList.add('tp-quieto'); }, OCULTAR_MS);
    }
  }

  // ---------- Abrir / cerrar ----------
  function pedirWakeLock() {
    if (!('wakeLock' in navigator) || st.estado === 'cerrado') return;
    navigator.wakeLock.request('screen').then(function (l) { st.wakeLock = l; }).catch(function () { /* sin soporte o sin permiso */ });
  }

  function abrir() {
    if (!st.palabras) return;
    renderizar(ui.texto.value);
    aplicarEstilos();
    ui.bVel.textContent = vel() + ' ppm';
    ui.escena.hidden = false;
    document.body.classList.add('tp-abierto');
    st.offset = 0;
    st.max = 0;
    setEstado('pausa');
    medir(false);
    var raiz = ui.escena;
    if (raiz.requestFullscreen) raiz.requestFullscreen({ navigationUI: 'hide' }).catch(function () { /* iPhone: queda la escena fija igual */ });
    pedirWakeLock();
    ui.escena.focus({ preventScroll: true });
    if (ui.cuenta.checked) cuentaRegresiva(); else reproducir();
  }

  function cerrar() {
    if (st.estado === 'cerrado') return;
    cancelAnimationFrame(st.raf);
    cancelarCuenta();
    clearTimeout(st.timerBarra);
    st.estado = 'cerrado';
    ui.escena.setAttribute('data-estado', 'cerrado');
    ui.escena.hidden = true;
    ui.escena.classList.remove('tp-quieto');
    document.body.classList.remove('tp-abierto');
    if (st.wakeLock) { st.wakeLock.release().catch(function () {}); st.wakeLock = null; }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    ui.reproducir.focus({ preventScroll: true });
  }

  // ---------- Eventos del formulario ----------
  ui.texto.addEventListener('input', actualizarFormulario);
  [ui.vel, ui.tam, ui.ancho].forEach(function (r) { r.addEventListener('input', actualizarFormulario); });
  ui.reproducir.addEventListener('click', abrir);
  ui.limpiar.addEventListener('click', function () {
    ui.texto.value = '';
    actualizarFormulario();
    ui.texto.focus();
  });
  ui.archivo.addEventListener('change', function () {
    var f = ui.archivo.files && ui.archivo.files[0];
    ui.archivo.value = '';
    if (!f) return;
    if (f.size > MAX_ARCHIVO) { ui.resumen.textContent = 'El archivo pesa más de 1 MB: pega el texto a mano.'; return; }
    var lector = new FileReader();
    lector.onload = function () { ui.texto.value = String(lector.result || ''); actualizarFormulario(); };
    lector.onerror = function () { ui.resumen.textContent = 'No se pudo leer el archivo.'; };
    lector.readAsText(f, 'utf-8');
  });

  // ---------- Eventos de la escena ----------
  ui.bPausa.addEventListener('click', function () { if (st.estado === 'cuenta') { cancelarCuenta(); reproducir(); } else alternar(); });
  ui.bInicio.addEventListener('click', function () { st.offset = 0; if (st.estado === 'fin') setEstado('pausa'); pintar(); mostrarBarra(); });
  ui.bLento.addEventListener('click', function () { cambiarVel(-VEL_PASO); });
  ui.bRapido.addEventListener('click', function () { cambiarVel(VEL_PASO); });
  ui.bSalir.addEventListener('click', cerrar);

  // Tocar = pausa/sigue; arrastrar = mover el texto a mano.
  var arrastre = null;
  ui.ventana.addEventListener('pointerdown', function (e) {
    arrastre = { y: e.clientY, movio: false, id: e.pointerId };
    ui.ventana.setPointerCapture(e.pointerId);
  });
  ui.ventana.addEventListener('pointermove', function (e) {
    mostrarBarra();
    if (!arrastre || arrastre.id !== e.pointerId) return;
    var dy = e.clientY - arrastre.y;
    if (!arrastre.movio && Math.abs(dy) < 8) return;
    arrastre.movio = true;
    arrastre.y = e.clientY;
    mover(-dy);
  });
  ui.ventana.addEventListener('pointerup', function (e) {
    if (!arrastre || arrastre.id !== e.pointerId) return;
    var fueToque = !arrastre.movio;
    arrastre = null;
    if (fueToque && st.estado !== 'cuenta') alternar();
  });
  ui.ventana.addEventListener('pointercancel', function () { arrastre = null; });
  ui.ventana.addEventListener('wheel', function (e) { e.preventDefault(); mover(e.deltaY); mostrarBarra(); }, { passive: false });
  ui.escena.addEventListener('mousemove', mostrarBarra);

  document.addEventListener('keydown', function (e) {
    if (st.estado === 'cerrado' || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    var hecho = true;
    if (k === ' ' || k === 'Spacebar') {
      // Con foco en un botón de la barra, Espacio lo activa de forma nativa: no se duplica.
      if (e.target.closest && e.target.closest('.tp-barra button')) hecho = false;
      else if (st.estado === 'cuenta') { cancelarCuenta(); reproducir(); }
      else alternar();
    }
    else if (k === 'ArrowUp') cambiarVel(VEL_PASO);
    else if (k === 'ArrowDown') cambiarVel(-VEL_PASO);
    else if (k === 'ArrowLeft' || k === 'PageUp') mover(-alturaLinea() * 3);
    else if (k === 'ArrowRight' || k === 'PageDown') mover(alturaLinea() * 3);
    else if (k === '+' || k === '=') cambiarTam(TAM_PASO);
    else if (k === '-' || k === '_') cambiarTam(-TAM_PASO);
    else if (k === 'Home') { st.offset = 0; if (st.estado === 'fin') setEstado('pausa'); pintar(); }
    else if (k === 'End') mover(st.max);
    else if (k === 'Escape') cerrar();
    else hecho = false;
    if (hecho) { e.preventDefault(); mostrarBarra(); }
  });

  // Salir de pantalla completa con Esc del navegador también cierra la lectura.
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && st.estado !== 'cerrado') cerrar();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') pedirWakeLock();
    else if (st.estado === 'reproduciendo') pausar();
  });
  window.addEventListener('resize', function () { if (st.estado !== 'cerrado') { medir(true); } });
  // Si la fuente termina de cargar o cambia el alto del texto, se recalcula sin perder el lugar.
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { if (st.estado !== 'cerrado') medir(true); }).observe(ui.columna);
  }

  // Aviso antes de perder el guion: no se guarda en ningún lado.
  window.addEventListener('beforeunload', function (e) {
    if (ui.texto.value.trim()) { e.preventDefault(); e.returnValue = ''; }
  });

  // En el celular, 40 % deja muy pocas palabras por línea: arranca más ancho y con letra más chica.
  if (window.innerWidth > 0 && window.innerWidth < 768) {
    ui.ancho.value = 90;
    ui.tam.value = 32;
    ui.anchoAyuda.textContent = 'En el celular arranca en 90 % para que entren varias palabras por línea.';
  }

  // Lectura para pruebas automáticas (no modifica nada).
  window.MMGTeleprompter = {
    estado: function () { return st.estado; },
    offset: function () { return st.offset; },
    max: function () { return st.max; }
  };

  actualizarFormulario();
  document.documentElement.setAttribute('data-listo', 'true');
})();
