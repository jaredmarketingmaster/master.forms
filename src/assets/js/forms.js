/* Pantalla 2 · Master de Forms. Arma el link del formulario; no guarda nada. */
(function () {
  'use strict';
  var C = window.MMGComun;
  var el = C.el;
  var datos = C.leerDatos('datos-forms');
  var etiquetas = datos.etiquetas_servicios || {};

  // En la URL solo van el nombre comercial y los servicios: se frena cualquier dato personal.
  var RX_EMAIL = /@/;
  var RX_TELEFONO = /\d[\d\s().-]{5,}\d/;
  var RX_URL = /(https?:|www\.)/i;

  function problemaNombre(nombre) {
    if (RX_EMAIL.test(nombre)) return 'Sin emails: solo el nombre comercial.';
    if (RX_TELEFONO.test(nombre)) return 'Sin teléfonos ni números largos: solo el nombre comercial.';
    if (RX_URL.test(nombre)) return 'Sin links: solo el nombre comercial.';
    return '';
  }

  function armarLink(form, nombre, servicios) {
    var params = [];
    if (nombre) params.push('n=' + encodeURIComponent(nombre));
    if (servicios.length) params.push('s=' + servicios.join(','));
    return form.url_base + (params.length ? '?' + params.join('&') : '');
  }

  function tarjeta(form) {
    var idNombre = 'nombre-' + form.id;
    var idAyuda = 'ayuda-' + form.id;
    var input = el('input', {
      id: idNombre, type: 'text', maxlength: '80', autocomplete: 'off', autocapitalize: 'words',
      spellcheck: 'false', 'aria-describedby': idAyuda
    });
    var ayuda = el('p', { class: 'ayuda', id: idAyuda, text: 'Opcional. Sin email, teléfono ni datos personales.' });
    var checks = form.servicios.map(function (s) {
      var id = 'srv-' + form.id + '-' + s;
      return el('label', { class: 'chip-check', for: id }, [
        el('input', { type: 'checkbox', id: id, value: s }),
        el('span', { text: etiquetas[s] || s })
      ]);
    });
    var boton = el('button', { type: 'button', class: 'btn-primary', text: 'Copiar link' });
    var estadoCopia = el('span', { class: 'estado-copia', role: 'status', 'aria-live': 'polite' });
    var motivo = el('p', { class: 'motivo-deshabilitado' });
    var salida = el('code', { class: 'link-armado' });

    function servicios() {
      return checks.map(function (l) { return l.querySelector('input'); })
        .filter(function (i) { return i.checked; })
        .map(function (i) { return i.value; });
    }

    function actualizar() {
      var nombre = input.value.trim().replace(/\s+/g, ' ');
      var problema = problemaNombre(nombre);
      var srv = servicios();
      input.setAttribute('aria-invalid', problema ? 'true' : 'false');
      ayuda.textContent = problema || 'Opcional. Sin email, teléfono ni datos personales.';
      ayuda.classList.toggle('es-error', !!problema);
      var motivoTxt = problema ? 'Corrige el nombre comercial para copiar el link.'
        : (!srv.length ? 'Elige al menos un servicio para copiar el link.' : '');
      boton.disabled = !!motivoTxt;
      motivo.textContent = motivoTxt;
      motivo.hidden = !motivoTxt;
      salida.textContent = problema ? '—' : armarLink(form, nombre, srv);
    }

    input.addEventListener('input', actualizar);
    checks.forEach(function (l) { l.querySelector('input').addEventListener('change', actualizar); });
    boton.addEventListener('click', function () {
      C.copiar(salida.textContent)
        .then(function () { C.avisarCopia(estadoCopia, 'Link copiado'); })
        .catch(function () { C.avisarCopia(estadoCopia, 'No se pudo copiar: selecciona el link a mano', true); });
    });

    var card = el('article', { class: 'panel form-card', 'data-form': form.id }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: form.nombre }),
        el('span', { class: 'pill pill-aviso', text: form.estado })
      ]),
      el('p', { class: 'form-desc', text: form.descripcion }),
      el('div', { class: 'campo' }, [el('label', { for: idNombre, text: 'Nombre comercial' }), input, ayuda]),
      el('fieldset', { class: 'campo' }, [el('legend', { text: 'Servicios' }), el('div', { class: 'chips' }, checks)]),
      el('div', { class: 'acciones' }, [boton, estadoCopia]),
      motivo,
      el('div', { class: 'link-box' }, [el('span', { class: 'link-label', text: 'Link armado' }), salida]),
      el('p', { class: 'meta', text: 'URL base de ejemplo: el formulario real todavía no existe.' })
    ]);
    actualizar();
    return card;
  }

  var cont = document.getElementById('forms');
  cont.textContent = '';
  datos.formularios.forEach(function (f) { cont.appendChild(tarjeta(f)); });
  document.documentElement.setAttribute('data-listo', 'true');
})();
