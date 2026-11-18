/* Utilidades compartidas del Centro de Mando MMG. Sin almacenamiento: nada se guarda. */
(function (root) {
  'use strict';

  var FMT = {
    ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    USD: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
  var FMT_NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

  function dinero(valor, moneda) {
    if (valor === null || valor === undefined || !isFinite(valor)) return '—';
    return FMT[moneda].format(valor);
  }

  function numero(valor) {
    return FMT_NUM.format(valor);
  }

  /** Acepta "300000", "300.000", "300.000,50", "1,5", "1.5". Devuelve null si no es un número positivo. */
  function leerNumero(texto) {
    var s = String(texto || '').trim().replace(/\s|\$|US/gi, '');
    if (!s) return null;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function leerDatos(id) {
    var el = document.getElementById(id);
    return JSON.parse(el.textContent);
  }

  /** Copia al portapapeles: API moderna y, si no está (archivo local), el método clásico. */
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).catch(function () { return copiarClasico(texto); });
    }
    return copiarClasico(texto);
  }

  function copiarClasico(texto) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.className = 'portapapeles-oculto';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('No se pudo copiar'));
    });
  }

  /** Muestra un estado breve junto al botón ("Copiado"). */
  function avisarCopia(el, texto, esError) {
    el.textContent = texto;
    el.classList.toggle('es-error', !!esError);
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('visible'); }, 2600);
  }

  /** Nombre corto para la interfaz: "Gestión de Pauta Digital · plataforma base" → nombre + detalle. */
  function partirNombre(servicio) {
    var m = String(servicio).match(/^(.*?)\s+(?:·\s+|\()(.*?)\)?$/);
    if (!m) return { nombre: servicio, detalle: '' };
    return { nombre: m[1], detalle: m[2] };
  }

  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) {
      if (h === null || h === undefined) return;
      n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return n;
  }

  root.MMGComun = {
    dinero: dinero, numero: numero, leerNumero: leerNumero, leerDatos: leerDatos,
    copiar: copiar, avisarCopia: avisarCopia, partirNombre: partirNombre, el: el
  };
})(window);
