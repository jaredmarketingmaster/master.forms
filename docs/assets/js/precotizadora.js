/* Pantalla 1 · Precotizadora. Interfaz sobre MMGCotizador: acá no hay precios ni reglas. */
(function () {
  'use strict';
  var C = window.MMGComun;
  var Q = window.MMGCotizador;
  var el = C.el;

  var tarifario = C.leerDatos('datos-tarifario');
  var porCodigo = {};
  tarifario.servicios.forEach(function (s) { porCodigo[s.codigo] = s; });
  var cte = tarifario.constantes;
  var pctTexto = new Intl.NumberFormat('es-AR').format(cte.descuento_extraordinario_pct) + ' %';
  var tcTexto = new Intl.NumberFormat('es-AR').format(cte.tc_ars_por_usd);
  var CORTO = {
    ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
    USD: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  };
  var AVISO_P2 = 'Descuento extraordinario ' + pctTexto + ': solo para clientes por hora que pasan a mensual · una vez al año · 12 meses · requiere OK de Jared.';
  var GRUPOS = [
    { modalidad: 'mensual', titulo: 'Mensuales' },
    { modalidad: 'unico', titulo: 'Pagos únicos' },
    { modalidad: 'hora', titulo: 'Por hora' }
  ];
  var OCULTOS = ['PAUTA_EXTRA']; // regla PLATAFORMAS: no se elige suelto
  var MODALIDAD = { mensual: 'por mes', unico: 'pago único', hora: 'por hora' };

  var estado;
  function estadoInicial() {
    return {
      sel: [],
      plataformas: [],
      horas: { WEB_APP: '1', HORA: '1' },
      precios: { CAPACITACION: { ARS: '', USD: '' } },
      bonificar: { WEB_INST: false },
      descuento: false,
      monedaCmd: 'ARS'
    };
  }
  estado = estadoInicial();

  function elegido(c) { return estado.sel.indexOf(c) !== -1; }

  function entrada() {
    var servicios = tarifario.servicios
      .map(function (s) { return s.codigo; })
      .filter(elegido);
    var horas = {};
    servicios.forEach(function (c) {
      if (porCodigo[c].modalidad === 'hora') horas[c] = C.leerNumero(estado.horas[c]);
    });
    var precios = {};
    servicios.forEach(function (c) {
      if (porCodigo[c].caso_a_caso) {
        var p = estado.precios[c] || {};
        precios[c] = { ARS: C.leerNumero(p.ARS), USD: C.leerNumero(p.USD) };
      }
    });
    return {
      servicios: servicios,
      plataformas: elegido('PAUTA') ? estado.plataformas.slice() : [],
      horas: horas,
      precios: precios,
      bonificar: Object.keys(estado.bonificar).filter(function (c) { return estado.bonificar[c] && elegido(c); }),
      descuentoExtraordinario: estado.descuento
    };
  }

  // ---------- Lista de servicios ----------
  function precioCatalogo(s) {
    if (s.caso_a_caso) return 'Caso a caso';
    var ars = typeof s.ars === 'number' ? s.ars : (s.ars_por_conversion ? s.usd * cte.tc_ars_por_usd : null);
    var partes = [];
    if (ars !== null) partes.push(CORTO.ARS.format(ars));
    if (typeof s.usd === 'number') partes.push(CORTO.USD.format(s.usd));
    return partes.join(' · ');
  }

  function extrasDe(s) {
    var c = s.codigo;
    if (c === 'PAUTA') {
      var extra = porCodigo.PAUTA_EXTRA;
      var chips = tarifario.plataformas.map(function (p) {
        return el('button', { type: 'button', class: 'chip', 'data-plataforma': p, 'aria-pressed': 'false', text: p });
      });
      return [
        el('div', { class: 'chips', role: 'group', 'aria-label': 'Plataformas de pauta' }, chips),
        el('p', { class: 'ayuda', text: 'La primera es la base. Cada plataforma extra suma ' +
          (extra ? precioCatalogo(extra) + ' por mes' : 'una plataforma adicional') + '.' })
      ];
    }
    if (c === 'EMBUDOS') return [el('p', { class: 'ayuda', text: 'Incluye Marketing Master HUB sin cargo.' })];
    if (c === 'LANDING') return [el('p', { class: 'ayuda', 'data-ayuda-landing': true, text: 'Va bonificada si se contratan Pauta + Embudos.' })];
    if (c === 'WEB_INST') {
      return [el('label', { class: 'switch-inline' }, [
        el('input', { type: 'checkbox', role: 'switch', class: 'switch', 'data-bonificar': c }),
        el('span', { text: 'Bonificar' })
      ])];
    }
    if (s.modalidad === 'hora') {
      var idH = 'horas-' + c;
      return [el('div', { class: 'campo campo-corto' }, [
        el('label', { for: idH, text: 'Horas' }),
        el('input', { id: idH, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-horas': c, value: estado.horas[c] })
      ])];
    }
    if (s.caso_a_caso) {
      return [el('div', { class: 'campos-par' }, ['ARS', 'USD'].map(function (m) {
        var id = 'precio-' + c + '-' + m;
        return el('div', { class: 'campo' }, [
          el('label', { for: id, text: 'Precio en ' + m }),
          el('input', { id: id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: m === 'ARS' ? 'Ej.: 300.000' : 'Ej.: 200',
            'data-precio': c, 'data-moneda': m })
        ]);
      })), el('p', { class: 'ayuda', text: 'Cada precio se usa solo en su moneda.' })];
    }
    if (s.ars_por_conversion) return [el('p', { class: 'ayuda', text: 'Solo USD. En ARS = USD × ' + tcTexto + '. Sin descuento extraordinario.' })];
    return [];
  }

  function pintarServicios() {
    var cont = document.getElementById('servicios');
    cont.textContent = '';
    GRUPOS.forEach(function (g) {
      var items = tarifario.servicios.filter(function (s) {
        return s.modalidad === g.modalidad && OCULTOS.indexOf(s.codigo) === -1;
      });
      if (!items.length) return;
      var lista = el('div', { class: 'grupo-lista' });
      items.forEach(function (s) {
        var n = C.partirNombre(s.servicio);
        var id = 'svc-' + s.codigo;
        var unidad = s.caso_a_caso ? '' : (s.modalidad === 'mensual' ? '/mes' : s.modalidad === 'hora' ? '/hora' : '');
        var extras = extrasDe(s);
        var fila = el('div', { class: 'svc', 'data-svc': s.codigo }, [
          el('div', { class: 'svc-row' }, [
            el('input', { type: 'checkbox', id: id, 'data-codigo': s.codigo }),
            el('label', { for: id, class: 'svc-label' }, [
              el('span', { class: 'svc-nombre', text: n.nombre }),
              n.detalle ? el('span', { class: 'svc-detalle', text: n.detalle }) : null,
              el('span', { class: 'svc-estado', 'data-estado': s.codigo })
            ]),
            el('span', { class: 'svc-precio num' }, [precioCatalogo(s), unidad ? el('span', { class: 'unidad', text: unidad }) : null])
          ]),
          extras.length ? el('div', { class: 'svc-extra', 'data-extra': s.codigo, hidden: true }, extras) : null
        ]);
        lista.appendChild(fila);
      });
      cont.appendChild(el('div', { class: 'grupo' }, [el('h3', { class: 'grupo-titulo', text: g.titulo }), lista]));
    });
  }

  // ---------- Resultado ----------
  function pill(texto, tipo, titulo) {
    return el('span', { class: 'pill pill-' + tipo, title: titulo || null, text: texto });
  }

  function celdaDinero(valorArs, valorUsd, tachado) {
    var cls = 'dinero' + (tachado ? ' tachado' : '');
    return [
      el('span', { class: cls + ' ars', text: C.dinero(valorArs === null ? null : Q.redondear2(valorArs), 'ARS') }),
      el('span', { class: cls + ' usd', text: C.dinero(valorUsd === null ? null : Q.redondear2(valorUsd), 'USD') })
    ];
  }

  function pintarLineas(r) {
    var tbody = document.getElementById('lineas');
    tbody.textContent = '';
    var filas = r.ARS.lineas;
    document.getElementById('lineas-cuenta').textContent = filas.length + (filas.length === 1 ? ' línea' : ' líneas');
    if (!filas.length) {
      tbody.appendChild(el('tr', { class: 'vacio' }, [el('td', { colspan: '4', text: 'Elige uno o más servicios y aquí aparece el cálculo.' })]));
      return;
    }
    filas.forEach(function (la, i) {
      var lu = r.USD.lineas[i];
      var t = porCodigo[la.codigo];
      var n = C.partirNombre(t.servicio);
      var marcas = [];
      if (la.bonificada) {
        var txt = la.codigo === 'HUB' ? 'Incluido' : la.codigo === 'LANDING' ? 'Bonificada' : 'Bonificado';
        marcas.push(pill(txt, 'positivo', la.motivo_bonificacion));
      } else if (la.descuento_pct || lu.descuento_pct) {
        marcas.push(pill('−' + pctTexto, 'aviso', 'Descuento extraordinario'));
      }
      var faltan = [];
      if (la.pendiente) faltan.push('ARS');
      if (lu.pendiente) faltan.push('USD');
      if (faltan.length) {
        var falta = t.modalidad === 'hora' ? 'Faltan horas' : 'Falta precio ' + faltan.join(' y ');
        marcas.push(pill(falta, 'negativo'));
      }
      var cantidad = t.modalidad === 'hora' ? (isFinite(la.cantidad) && la.cantidad > 0 ? C.numero(la.cantidad) + ' h' : '—') : C.numero(la.cantidad);
      var nombre = la.codigo === 'PAUTA_EXTRA' ? 'Plataforma adicional de pauta' : n.nombre;
      var tr = el('tr', {
        'data-codigo': la.codigo,
        'data-neto-ars': la.pendiente ? '' : String(la.neto),
        'data-neto-usd': lu.pendiente ? '' : String(lu.neto),
        'data-lista-ars': la.lista === null ? '' : String(la.lista),
        'data-lista-usd': lu.lista === null ? '' : String(lu.lista),
        'data-bonificada': String(la.bonificada)
      }, [
        el('th', { scope: 'row' }, [
          el('span', { class: 'linea-nombre', text: nombre }),
          el('span', { class: 'linea-detalle' }, [
            MODALIDAD[t.modalidad],
            el('span', { class: 'cant-movil', text: ' · cant. ' + cantidad })
          ]),
          marcas.length ? el('span', { class: 'marcas' }, marcas) : null
        ]),
        el('td', { class: 'num', text: cantidad }),
        el('td', { class: 'num' }, celdaDinero(la.lista, lu.lista, la.bonificada)),
        el('td', { class: 'num final' }, celdaDinero(la.pendiente ? null : la.neto, lu.pendiente ? null : lu.neto, false))
      ]);
      tbody.appendChild(tr);
    });
  }

  function pintarTotales(r) {
    ['ARS', 'USD'].forEach(function (m) {
      Object.keys(r[m].totales).forEach(function (k) {
        var td = document.querySelector('[data-total="' + k + '"][data-moneda="' + m + '"]');
        td.textContent = C.dinero(r[m].totales[k], m);
        td.setAttribute('data-valor', String(r[m].totales[k]));
      });
      document.querySelector('[data-resumen="' + m + '"]').textContent = C.dinero(r[m].totales.primer_pago_mes_1, m);
    });
  }

  function pintarAvisos(r) {
    var ul = document.getElementById('avisos');
    ul.textContent = '';
    var lista = [];
    function sumar(t) { if (lista.indexOf(t) === -1) lista.push(t); }
    if (estado.descuento) sumar(AVISO_P2);
    r.ARS.advertencias.forEach(sumar);
    r.USD.advertencias.forEach(sumar);
    (tarifario.advertencias_fijas || []).forEach(function (t) { sumar('Del tarifario: ' + t); });
    lista.forEach(function (t) {
      ul.appendChild(el('li', { class: t === AVISO_P2 ? 'aviso-p2' : null, text: t }));
    });
  }

  function pintarControles() {
    tarifario.servicios.forEach(function (s) {
      var c = s.codigo;
      var cb = document.querySelector('input[data-codigo="' + c + '"]');
      if (!cb) return;
      var incluidoHub = c === 'HUB' && elegido('EMBUDOS');
      cb.checked = elegido(c) || incluidoHub;
      cb.disabled = incluidoHub;
      var est = document.querySelector('[data-estado="' + c + '"]');
      est.textContent = '';
      if (incluidoHub) est.appendChild(pill('Incluido con Embudos', 'positivo'));
      if (c === 'LANDING' && elegido('LANDING') && elegido('PAUTA') && elegido('EMBUDOS')) est.appendChild(pill('Bonificada', 'positivo'));
      if (c === 'WEB_INST' && elegido(c) && estado.bonificar.WEB_INST) est.appendChild(pill('Bonificado', 'positivo'));
      var extra = document.querySelector('[data-extra="' + c + '"]');
      if (extra) extra.hidden = !elegido(c);
    });
    document.querySelectorAll('[data-plataforma]').forEach(function (b) {
      var i = estado.plataformas.indexOf(b.getAttribute('data-plataforma'));
      b.setAttribute('aria-pressed', String(i !== -1));
      b.classList.toggle('es-base', i === 0);
    });
    var bonif = document.querySelector('[data-bonificar="WEB_INST"]');
    if (bonif) bonif.checked = !!estado.bonificar.WEB_INST;
    document.getElementById('descuento').checked = estado.descuento;
    document.getElementById('descuento-aviso').hidden = !estado.descuento;
    document.querySelectorAll('[data-moneda-cmd]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-moneda-cmd') === estado.monedaCmd));
    });
  }

  function render() {
    var e = entrada();
    var r = Q.calcularAmbas(tarifario, e);
    pintarControles();
    pintarTotales(r);
    pintarLineas(r);
    pintarAvisos(r);
    document.getElementById('comando').textContent = Q.comando(tarifario, e, estado.monedaCmd);
  }

  // ---------- Eventos ----------
  function alternar(lista, valor) {
    var i = lista.indexOf(valor);
    if (i === -1) lista.push(valor); else lista.splice(i, 1);
  }

  function enlazar() {
    var cont = document.getElementById('servicios');
    cont.addEventListener('change', function (ev) {
      var t = ev.target;
      var c = t.getAttribute('data-codigo');
      if (c) {
        alternar(estado.sel, c);
        if (c === 'PAUTA' && elegido('PAUTA') && !estado.plataformas.length) estado.plataformas = [tarifario.plataformas[0]];
        render();
        return;
      }
      var b = t.getAttribute('data-bonificar');
      if (b) { estado.bonificar[b] = t.checked; render(); }
    });
    cont.addEventListener('input', function (ev) {
      var t = ev.target;
      var h = t.getAttribute('data-horas');
      if (h) { estado.horas[h] = t.value; render(); return; }
      var p = t.getAttribute('data-precio');
      if (p) { estado.precios[p][t.getAttribute('data-moneda')] = t.value; render(); }
    });
    cont.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-plataforma]');
      if (!b) return;
      alternar(estado.plataformas, b.getAttribute('data-plataforma'));
      render();
    });
    document.getElementById('descuento').addEventListener('change', function (ev) {
      estado.descuento = ev.target.checked;
      render();
    });
    document.querySelectorAll('[data-moneda-cmd]').forEach(function (b) {
      b.addEventListener('click', function () { estado.monedaCmd = b.getAttribute('data-moneda-cmd'); render(); });
    });
    document.getElementById('btn-limpiar').addEventListener('click', function () {
      estado = estadoInicial();
      document.querySelectorAll('[data-horas]').forEach(function (i) { i.value = estado.horas[i.getAttribute('data-horas')]; });
      document.querySelectorAll('[data-precio]').forEach(function (i) { i.value = ''; });
      render();
    });
    var estadoCmd = document.getElementById('estado-comando');
    document.getElementById('btn-copiar-comando').addEventListener('click', function () {
      C.copiar(document.getElementById('comando').textContent)
        .then(function () { C.avisarCopia(estadoCmd, 'Comando copiado'); })
        .catch(function () { C.avisarCopia(estadoCmd, 'No se pudo copiar: selecciónalo a mano', true); });
    });
  }

  document.getElementById('descuento-titulo').textContent = 'Descuento extraordinario ' + pctTexto;
  pintarServicios();
  enlazar();
  render();
  document.documentElement.setAttribute('data-listo', 'true');
})();
