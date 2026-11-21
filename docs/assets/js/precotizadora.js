/* Pantalla 1 · Precotizadora en formato carta de menú.
 * Interfaz sobre MMGCotizador: acá no hay precios ni reglas, solo cómo se eligen.
 * La selección vive en la URL (?s=…&p=…&r=…&n=…): sin localStorage y sin servidor. */
(function () {
  'use strict';
  var C = window.MMGComun;
  var Q = window.MMGCotizador;
  var el = C.el;

  var tarifario = C.leerDatos('datos-tarifario');
  var porCodigo = {};
  tarifario.servicios.forEach(function (s) { porCodigo[s.codigo] = s; });
  var cte = tarifario.constantes;
  var pctTexto = new Intl.NumberFormat('es-AR').format(cte.descuento_extraordinario_pct) + ' %';
  var tcTexto = new Intl.NumberFormat('es-AR').format(cte.tc_ars_por_usd);
  var CORTO = {
    ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
    USD: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  };
  var AVISO_P2 = 'Descuento extraordinario ' + pctTexto + ': solo para clientes por hora que pasan a mensual · una vez al año · 12 meses · requiere OK de Jared.';
  var UNIDAD = { mensual: '/mes', unico: '', hora: '/hora' };
  var MODALIDAD = { mensual: 'por mes', unico: 'pago único', hora: 'por hora' };

  // Estructura de la carta (solo agrupa; los precios y las reglas vienen del tarifario y del motor).
  var CATEGORIAS = [
    { id: 'pauta', titulo: 'Pauta digital', codigos: ['PAUTA'] },
    { id: 'embudos', titulo: 'Embudos y CRM', codigos: ['EMBUDOS', 'HUB'] },
    { id: 'ecommerce', titulo: 'E-commerce', codigos: ['ECOMMERCE'] },
    { id: 'redes', titulo: 'Redes sociales', especial: 'redes' },
    { id: 'creativos', titulo: 'Creativos y contenido', codigos: ['CREATIVOS'] },
    { id: 'web', titulo: 'Web', sub: 'Landing, institucional y web app', codigos: ['LANDING', 'WEB_INST', 'WEB_APP'] },
    { id: 'horas', titulo: 'Horas y capacitación', codigos: ['HORA', 'CAPACITACION'] },
    { id: 'nicho', titulo: 'Producto de nicho', sub: 'I.C.T. iPhone', codigos: ['ICT_IPHONE', 'ICT_IPHONE_CRM'] }
  ];
  var UPSELL = Q.UPSELL_PADRE; // { EMAIL_EMBUDOS: 'EMBUDOS', … }
  var UPSELL_DE = {};
  Object.keys(UPSELL).forEach(function (u) { if (porCodigo[u]) UPSELL_DE[UPSELL[u]] = u; });
  var PACKS = Object.keys(Q.REDES_PACKS).filter(function (c) { return porCodigo[c]; });
  var MAPA_REDES = Q.mapaRedes(tarifario);
  var REDES = (tarifario.redes_adicionales || []).filter(function (r) { return MAPA_REDES[r.toLowerCase()]; });

  // Lo que no se elige como tarjeta propia: lo agrega el motor o va dentro de otra tarjeta.
  function esInterno(c) {
    return c === 'PAUTA_EXTRA' || UPSELL[c] || Q.REDES_PACKS[c] || c.indexOf('REDES_X_') === 0;
  }
  // Servicios nuevos del tarifario sin categoría: no se pierden, van a "Otros servicios".
  var asignados = {};
  CATEGORIAS.forEach(function (cat) { (cat.codigos || []).forEach(function (c) { asignados[c] = true; }); });
  var otros = tarifario.servicios.map(function (s) { return s.codigo; })
    .filter(function (c) { return !asignados[c] && !esInterno(c); });
  if (otros.length) CATEGORIAS.push({ id: 'otros', titulo: 'Otros servicios', codigos: otros });
  CATEGORIAS.forEach(function (cat) {
    if (cat.codigos) cat.codigos = cat.codigos.filter(function (c) { return porCodigo[c]; });
  });

  // ---------- Estado ----------
  var estado;
  function estadoInicial() {
    return {
      sel: [], plataformas: [], pack: null, redes: [],
      horas: { WEB_APP: '1', HORA: '1' },
      precios: { CAPACITACION: { ARS: '', USD: '' } },
      bonificar: { WEB_INST: false },
      descuento: false,
      moneda: 'ARS'
    };
  }
  estado = estadoInicial();
  function elegido(c) { return estado.sel.indexOf(c) !== -1; }

  /** Servicios en el orden de la carta, con el upsell justo después de su padre. */
  function serviciosOrdenados() {
    var out = [];
    CATEGORIAS.forEach(function (cat) {
      if (cat.especial === 'redes') { if (estado.pack) out.push(estado.pack); return; }
      cat.codigos.forEach(function (c) {
        if (!elegido(c)) return;
        if (c === 'HUB' && elegido('EMBUDOS')) return; // lo agrega el motor, bonificado
        out.push(c);
        var up = UPSELL_DE[c];
        if (up && elegido(up)) out.push(up);
      });
    });
    return out;
  }

  function entrada() {
    var servicios = serviciosOrdenados();
    var horas = {}, precios = {};
    servicios.forEach(function (c) {
      if (porCodigo[c].modalidad === 'hora') horas[c] = C.leerNumero(estado.horas[c]);
      if (porCodigo[c].caso_a_caso) {
        var p = estado.precios[c] || {};
        precios[c] = { ARS: C.leerNumero(p.ARS), USD: C.leerNumero(p.USD) };
      }
    });
    return {
      servicios: servicios,
      plataformas: elegido('PAUTA') ? estado.plataformas.slice() : [],
      redes: estado.pack ? estado.redes.slice() : [],
      horas: horas,
      precios: precios,
      bonificar: Object.keys(estado.bonificar).filter(function (c) { return estado.bonificar[c] && elegido(c); }),
      descuentoExtraordinario: estado.descuento
    };
  }

  // ---------- Precios de catálogo (solo lectura del tarifario) ----------
  function unitario(s, m) {
    if (s.caso_a_caso) return null;
    if (m === 'USD') return typeof s.usd === 'number' ? s.usd : null;
    if (typeof s.ars === 'number') return s.ars;
    return s.ars_por_conversion && typeof s.usd === 'number' ? s.usd * cte.tc_ars_por_usd : null;
  }
  function precioTexto(s, conMas) {
    if (s.caso_a_caso) return 'Caso a caso';
    var v = unitario(s, estado.moneda);
    if (v === null) return 'Sin precio en ' + estado.moneda;
    return (conMas ? '+' : '') + CORTO[estado.moneda].format(v) + (UNIDAD[s.modalidad] || '');
  }
  function aValidar(s) { return !!s && !!s.estado && String(s.estado).toUpperCase() !== 'CONFIRMADO'; }
  function pill(texto, tipo, titulo) {
    return el('span', { class: 'pill pill-' + tipo, title: titulo || null, text: texto });
  }
  function nivelDe(pack) { // "Gestión de Redes Sociales · Crecimiento (…)" → "Crecimiento"
    var m = String(porCodigo[pack].servicio).match(/·\s*([^·(]+?)\s*\(/);
    return m ? m[1] : pack;
  }
  function piezasDe(pack) {
    var m = String(porCodigo[pack].nota || '').match(/(\d+)\s+piezas/);
    return m ? m[1] + ' piezas' : '';
  }
  function incluyeDe(pack) { // contenido del paréntesis: "Instagram + Facebook, 16 estáticos + 8 reels"
    var m = String(porCodigo[pack].servicio).match(/\(([^)]+)\)/);
    return m ? m[1] : '';
  }
  function codigoRed(red, pack) {
    return (MAPA_REDES[red.toLowerCase()] || {})[Q.REDES_PACKS[pack]] || null;
  }

  // ---------- Carta ----------
  var dinamicos = []; // funciones que repintan textos que dependen de la moneda o del estado

  function filaServicio(s, extras) {
    var c = s.codigo;
    var n = C.partirNombre(s.servicio);
    var id = 'svc-' + c;
    var precio = el('span', { class: 'svc-precio num' });
    dinamicos.push(function () { precio.textContent = precioTexto(s); });
    return el('div', { class: 'svc', 'data-svc': c }, [
      el('div', { class: 'svc-row' }, [
        el('input', { type: 'checkbox', id: id, 'data-codigo': c }),
        el('label', { for: id, class: 'svc-label' }, [
          el('span', { class: 'svc-nombre', text: n.nombre }),
          n.detalle ? el('span', { class: 'svc-detalle', text: n.detalle }) : null,
          el('span', { class: 'svc-estado', 'data-estado': c }, aValidar(s) ? [pill('Precio a validar', 'aviso')] : [])
        ]),
        precio
      ]),
      extras && extras.length ? el('div', { class: 'svc-extra', 'data-extra': c, hidden: true }, extras) : null
    ]);
  }

  function filaIncluida(s, motivo) { // HUB dentro de Embudos: lista tachada, neto 0
    var precio = el('span', { class: 'tachado num' });
    dinamicos.push(function () { precio.textContent = precioTexto(s); });
    return el('div', { class: 'sub-fila' }, [
      el('span', { class: 'sub-nombre' }, [C.partirNombre(s.servicio).nombre, el('span', { class: 'sub-motivo', text: motivo })]),
      el('span', { class: 'sub-precio' }, [precio, pill('Incluido', 'positivo')])
    ]);
  }

  function switchUpsell(up, padre) {
    var su = porCodigo[up], sp = porCodigo[padre];
    var pct = sp.usd ? Math.round((su.usd / sp.usd) * 100) : null;
    var id = 'upsell-' + up;
    var precio = el('span', { class: 'sub-precio num' });
    dinamicos.push(function () { precio.textContent = precioTexto(su, true); });
    return el('div', { class: 'sub-fila sub-switch' }, [
      el('label', { for: id, class: 'switch-inline' }, [
        el('input', { type: 'checkbox', role: 'switch', class: 'switch', id: id, 'data-upsell': up }),
        el('span', { text: 'Sumar Email Marketing' + (pct ? ' (+' + pct + ' %)' : '') })
      ]),
      precio,
      aValidar(su) ? pill('Precio a validar', 'aviso') : null
    ]);
  }

  function extrasDe(s) {
    var c = s.codigo;
    var out = [];
    if (c === 'PAUTA') {
      var chips = tarifario.plataformas.map(function (p) {
        return el('button', { type: 'button', class: 'chip', 'data-plataforma': p, 'aria-pressed': 'false', text: p });
      });
      out.push(el('p', { class: 'ayuda ayuda-fuerte', text: 'Elige las plataformas. La primera es la base y cada una de las demás suma una plataforma adicional.' }));
      out.push(el('div', { class: 'chips', role: 'group', 'aria-label': 'Plataformas de pauta' }, chips));
      out.push(el('ol', { class: 'desglose', id: 'desglose-pauta', 'aria-label': 'Desglose por plataforma' }));
    }
    if (c === 'EMBUDOS' && porCodigo.HUB) out.push(filaIncluida(porCodigo.HUB, 'Incluido en la Gestión de Embudos de Venta'));
    if (UPSELL_DE[c]) out.push(switchUpsell(UPSELL_DE[c], c));
    if (c === 'LANDING') out.push(el('p', { class: 'ayuda', text: 'Va bonificada si contratas Pauta + Embudos.' }));
    if (c === 'WEB_INST') {
      out.push(el('label', { class: 'switch-inline' }, [
        el('input', { type: 'checkbox', role: 'switch', class: 'switch', 'data-bonificar': c }),
        el('span', { text: 'Bonificar' })
      ]));
    }
    if (s.modalidad === 'hora') {
      var idH = 'horas-' + c;
      out.push(el('div', { class: 'campo campo-corto' }, [
        el('label', { for: idH, text: 'Horas' }),
        el('input', { id: idH, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-horas': c, value: estado.horas[c] })
      ]));
    }
    if (s.caso_a_caso) {
      out.push(el('div', { class: 'campos-par' }, ['ARS', 'USD'].map(function (m) {
        var id = 'precio-' + c + '-' + m;
        return el('div', { class: 'campo' }, [
          el('label', { for: id, text: 'Precio en ' + m }),
          el('input', { id: id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: m === 'ARS' ? 'Ej.: 300.000' : 'Ej.: 200',
            'data-precio': c, 'data-moneda': m })
        ]);
      })));
      out.push(el('p', { class: 'ayuda', text: 'Cada precio se usa solo en su moneda.' }));
    }
    if (s.ars_por_conversion) out.push(el('p', { class: 'ayuda', text: 'Solo USD. En ARS = USD × ' + tcTexto + '. Sin descuento extraordinario.' }));
    return out;
  }

  function bloqueRedes() {
    if (!PACKS.length) return [];
    var base = C.partirNombre(porCodigo[PACKS[0]].servicio).nombre;
    var niveles = PACKS.map(function (p) {
      var id = 'nivel-' + p;
      var precio = el('span', { class: 'nivel-precio num' });
      dinamicos.push(function () { precio.textContent = precioTexto(porCodigo[p]); });
      return el('div', { class: 'nivel' }, [
        el('input', { type: 'radio', name: 'redes-nivel', id: id, 'data-pack': p }),
        el('label', { for: id }, [
          el('span', { class: 'nivel-nombre', text: nivelDe(p) }),
          el('span', { class: 'nivel-piezas', text: piezasDe(p) }),
          precio,
          aValidar(porCodigo[p]) ? pill('Precio a validar', 'aviso') : null
        ])
      ]);
    });
    var chips = REDES.map(function (r) {
      var precio = el('span', { class: 'chip-precio' });
      dinamicos.push(function () {
        var code = estado.pack && codigoRed(r, estado.pack);
        precio.textContent = code ? precioTexto(porCodigo[code], true).replace(/\/mes$/, '') : '';
      });
      return el('button', { type: 'button', class: 'chip', 'data-red': r, 'aria-pressed': 'false' }, [r, precio]);
    });
    var incluye = el('p', { class: 'ayuda', id: 'redes-incluye' });
    dinamicos.push(function () { incluye.textContent = estado.pack ? 'Incluye ' + incluyeDe(estado.pack) + '.' : ''; });
    return [el('div', { class: 'svc', 'data-svc': 'REDES' }, [
      el('div', { class: 'svc-row' }, [
        el('input', { type: 'checkbox', id: 'redes-activo' }),
        el('label', { for: 'redes-activo', class: 'svc-label' }, [
          el('span', { class: 'svc-nombre', text: base }),
          el('span', { class: 'svc-detalle', text: 'Un solo nivel por cotización, siempre con Instagram + Facebook' })
        ]),
        el('span', { class: 'svc-precio num', id: 'redes-precio' })
      ]),
      el('div', { class: 'svc-extra', 'data-extra': 'REDES', hidden: true }, [
        el('div', { class: 'niveles', role: 'radiogroup', 'aria-label': 'Nivel del pack de redes' }, niveles),
        incluye,
        el('p', { class: 'ayuda ayuda-fuerte', text: 'Suma más redes. Cada una se cotiza en el mismo nivel del pack.' }),
        el('div', { class: 'chips', role: 'group', 'aria-label': 'Redes adicionales' }, chips)
      ])
    ])];
  }

  function pintarCarta() {
    var cont = document.getElementById('carta');
    cont.textContent = '';
    CATEGORIAS.forEach(function (cat) {
      var items = cat.especial === 'redes' ? bloqueRedes()
        : cat.codigos.map(function (c) { return filaServicio(porCodigo[c], extrasDe(porCodigo[c])); });
      if (!items.length) return;
      cont.appendChild(el('details', { class: 'cat', 'data-cat': cat.id }, [
        el('summary', {}, [
          el('span', { class: 'cat-textos' }, [
            el('span', { class: 'cat-titulo', text: cat.titulo }),
            cat.sub ? el('span', { class: 'cat-sub', text: cat.sub }) : null
          ]),
          el('span', { class: 'cat-badge', 'data-badge': cat.id }),
          el('svg', {}, [])
        ]),
        el('div', { class: 'cat-cuerpo' }, items)
      ]));
    });
    // Chevron (SVG por innerHTML fijo, sin datos)
    cont.querySelectorAll('summary > svg').forEach(function (s) {
      s.outerHTML = '<svg class="cat-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    });
  }

  function abrirCategoriasElegidas() {
    CATEGORIAS.forEach(function (cat) {
      var det = document.querySelector('details[data-cat="' + cat.id + '"]');
      if (!det) return;
      var hay = cat.especial === 'redes' ? !!estado.pack : cat.codigos.some(elegido);
      if (hay) det.open = true;
    });
  }

  // ---------- Resumen ----------
  function dinero(v, m) { return C.dinero(v === null ? null : Q.redondear2(v), m); }

  function nombreLinea(la) {
    var t = porCodigo[la.codigo];
    var n = C.partirNombre(t.servicio);
    if (la.codigo === 'PAUTA') {
      var base = estado.plataformas[0];
      return { nombre: n.nombre, detalle: base ? 'Base: ' + base : 'Plataforma base' };
    }
    if (la.codigo === 'PAUTA_EXTRA') {
      return { nombre: 'Plataformas adicionales de pauta', detalle: estado.plataformas.slice(1).join(', ') + ' · ' + C.numero(la.cantidad) + ' × ' + precioTexto(t) };
    }
    if (UPSELL[la.codigo]) return { nombre: 'Email Marketing', detalle: 'Con ' + C.partirNombre(porCodigo[UPSELL[la.codigo]].servicio).nombre };
    if (Q.REDES_PACKS[la.codigo]) return { nombre: n.nombre + ' · ' + nivelDe(la.codigo), detalle: incluyeDe(la.codigo) };
    if (t.modalidad === 'hora') {
      var h = isFinite(la.cantidad) && la.cantidad > 0 ? C.numero(la.cantidad) + ' h × ' + precioTexto(t) : 'Faltan las horas';
      return { nombre: n.nombre, detalle: h };
    }
    return { nombre: n.nombre, detalle: n.detalle || MODALIDAD[t.modalidad] };
  }

  function pintarLineas(r) {
    var tbody = document.getElementById('lineas');
    tbody.textContent = '';
    var filas = r.ARS.lineas;
    if (!filas.length) {
      tbody.appendChild(el('tr', { class: 'vacio' }, [el('td', { colspan: '2', text: 'Abre una categoría y elige servicios: aquí se arma la cotización.' })]));
      return;
    }
    filas.forEach(function (la, i) {
      var lu = r.USD.lineas[i];
      var t = porCodigo[la.codigo];
      var nl = nombreLinea(la);
      var marcas = [];
      if (la.bonificada) {
        var txt = la.codigo === 'HUB' ? 'Incluido' : la.codigo === 'LANDING' ? 'Bonificada' : 'Bonificado';
        marcas.push(pill(txt, 'positivo', la.motivo_bonificacion));
      } else if (la.descuento_pct || lu.descuento_pct) {
        marcas.push(pill('−' + pctTexto, 'aviso', 'Descuento extraordinario'));
      }
      if (aValidar(t)) marcas.push(pill('Precio a validar', 'aviso'));
      var faltan = [];
      if (la.pendiente) faltan.push('ARS');
      if (lu.pendiente) faltan.push('USD');
      if (faltan.length) marcas.push(pill(t.modalidad === 'hora' ? 'Faltan horas' : 'Falta precio ' + faltan.join(' y '), 'negativo'));
      var tachar = la.bonificada || la.descuento_pct || lu.descuento_pct;
      var precio = ['ARS', 'USD'].map(function (m) {
        var l = m === 'ARS' ? la : lu;
        return el('span', { class: 'precio-' + m.toLowerCase(), 'data-moneda': m }, [
          tachar && l.lista !== null ? el('span', { class: 'dinero tachado', text: dinero(l.lista, m) }) : null,
          el('span', { class: 'dinero final', text: dinero(l.pendiente ? null : l.neto, m) }),
          el('span', { class: 'unidad', text: MODALIDAD[t.modalidad] })
        ]);
      });
      tbody.appendChild(el('tr', {
        'data-codigo': la.codigo,
        'data-neto-ars': la.pendiente ? '' : String(la.neto),
        'data-neto-usd': lu.pendiente ? '' : String(lu.neto),
        'data-lista-ars': la.lista === null ? '' : String(la.lista),
        'data-lista-usd': lu.lista === null ? '' : String(lu.lista),
        'data-bonificada': String(la.bonificada)
      }, [
        el('th', { scope: 'row' }, [
          el('span', { class: 'linea-nombre', text: nl.nombre }),
          nl.detalle ? el('span', { class: 'linea-detalle', text: nl.detalle }) : null,
          marcas.length ? el('span', { class: 'marcas' }, marcas) : null
        ]),
        el('td', { class: 'num' }, precio)
      ]));
    });
  }

  function pintarTotales(r) {
    ['ARS', 'USD'].forEach(function (m) {
      Object.keys(r[m].totales).forEach(function (k) {
        var n = document.querySelector('[data-total="' + k + '"][data-moneda="' + m + '"]');
        n.textContent = C.dinero(r[m].totales[k], m);
        n.setAttribute('data-valor', String(r[m].totales[k]));
      });
    });
    var cant = r.ARS.lineas.length;
    document.getElementById('resumen-cuenta').textContent = cant ? cant + (cant === 1 ? ' línea' : ' líneas') : 'Sin servicios';
    document.getElementById('resumen-valor').textContent = C.dinero(r[estado.moneda].totales.primer_pago_mes_1, estado.moneda);
    // Regla P4: precio real (tachado) y ahorro. Los totales de arriba no cambian.
    var bloque = document.getElementById('promo-resumen');
    bloque.hidden = !PROMO || !cant;
    if (!PROMO) return;
    ['ARS', 'USD'].forEach(function (m) {
      var t = r[m].totales;
      document.querySelectorAll('[data-real][data-moneda="' + m + '"]').forEach(function (n) {
        var v = PROMO.real(t[n.getAttribute('data-real')]);
        n.textContent = C.dinero(v, m);
        n.setAttribute('data-valor', String(v));
      });
      document.querySelectorAll('[data-ahorro][data-moneda="' + m + '"]').forEach(function (n) {
        var v = PROMO.ahorro(t[n.getAttribute('data-ahorro')]);
        n.textContent = C.dinero(v, m);
        n.setAttribute('data-valor', String(v));
      });
    });
  }

  // ---------- Precio de lanzamiento (regla P4) ----------
  var PROMO = Q.promoLanzamiento(tarifario);
  function fechaLarga(iso) {
    var p = String(iso).split('-').map(Number);
    return String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0') + '/' + p[0];
  }
  function pintarPromo() {
    var aviso = document.getElementById('promo');
    if (!PROMO) { aviso.hidden = true; return; }
    var p = PROMO.fin.split('-').map(Number);
    var desde = new Date(p[0], p[1], 1); // mes siguiente al fin de la promo
    var mesDesde = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(desde);
    var pct = PROMO.pct + ' %';
    var vencida = new Date() > new Date(p[0], p[1] - 1, p[2], 23, 59, 59);
    aviso.textContent = '';
    aviso.appendChild(el('strong', { text: vencida ? 'Precio de lanzamiento vencido. ' : 'Precio de lanzamiento: ' + pct + ' off. ' }));
    aviso.appendChild(document.createTextNode(vencida
      ? 'Terminó el ' + fechaLarga(PROMO.fin) + ': confirma con MMG que el tarifario ya tenga el precio real antes de cotizar.'
      : 'Todos los precios de esta precotizadora ya tienen ' + pct + ' de descuento sobre el precio real. Vale para quien contrate hasta el ' +
        fechaLarga(PROMO.fin) + (PROMO.meses ? ' y se mantiene ' + PROMO.meses + ' meses' : '') +
        '. Desde ' + mesDesde + ', el precio real es el doble.'));
    aviso.classList.toggle('promo-vencida', vencida);
    aviso.hidden = false;
    document.getElementById('promo-resumen-titulo').textContent =
      'Precio de lanzamiento · ' + pct + ' off hasta el ' + fechaLarga(PROMO.fin) + (PROMO.meses ? ', por ' + PROMO.meses + ' meses' : '');
  }

  // Los textos del tarifario pueden nombrar códigos internos: en pantalla va el nombre del servicio.
  function sinCodigos(t) {
    return String(t).replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g, function (c) {
      return porCodigo[c] && porCodigo[c].servicio.indexOf(c) === -1 ? C.partirNombre(porCodigo[c].servicio).nombre : c;
    });
  }

  function pintarAvisos(r) {
    var ul = document.getElementById('avisos');
    ul.textContent = '';
    var lista = [];
    function sumar(t) { if (lista.indexOf(t) === -1) lista.push(t); }
    if (estado.descuento) sumar(AVISO_P2);
    r.ARS.advertencias.map(sinCodigos).forEach(sumar);
    r.USD.advertencias.map(sinCodigos).forEach(sumar);
    (tarifario.advertencias_fijas || []).forEach(function (t) { sumar('Del tarifario: ' + sinCodigos(t)); });
    lista.forEach(function (t) { ul.appendChild(el('li', { class: t === AVISO_P2 ? 'aviso-p2' : null, text: t })); });
  }

  function pintarDesglose() {
    var ol = document.getElementById('desglose-pauta');
    if (!ol) return;
    ol.textContent = '';
    estado.plataformas.forEach(function (p, i) {
      var s = porCodigo[i === 0 ? 'PAUTA' : 'PAUTA_EXTRA'];
      ol.appendChild(el('li', { 'data-desglose-plataforma': p }, [
        el('span', { class: 'sub-nombre' }, [p, el('span', { class: 'sub-motivo', text: i === 0 ? 'Plataforma base' : 'Plataforma adicional' })]),
        el('span', { class: 'sub-precio num', text: s ? precioTexto(s) : '—' })
      ]));
    });
  }

  function pintarControles() {
    CATEGORIAS.forEach(function (cat) {
      (cat.codigos || []).forEach(function (c) {
        var cb = document.querySelector('input[data-codigo="' + c + '"]');
        if (!cb) return;
        cb.checked = elegido(c);
        var extra = document.querySelector('[data-extra="' + c + '"]');
        if (extra) extra.hidden = !elegido(c);
        var est = document.querySelector('[data-estado="' + c + '"]');
        est.querySelectorAll('.pill-positivo').forEach(function (p) { p.remove(); });
        if (c === 'LANDING' && elegido('LANDING') && elegido('PAUTA') && elegido('EMBUDOS')) est.appendChild(pill('Bonificada con Pauta + Embudos', 'positivo'));
        if (c === 'WEB_INST' && elegido(c) && estado.bonificar.WEB_INST) est.appendChild(pill('Bonificado', 'positivo'));
      });
      var badge = document.querySelector('[data-badge="' + cat.id + '"]');
      if (badge) {
        var n = cat.especial === 'redes' ? (estado.pack ? 1 + estado.redes.length : 0)
          : cat.codigos.filter(elegido).length + cat.codigos.filter(function (c) { return UPSELL_DE[c] && elegido(UPSELL_DE[c]); }).length;
        badge.textContent = n ? String(n) : '';
        badge.setAttribute('aria-label', n ? n + (n === 1 ? ' elegido' : ' elegidos') : '');
      }
    });
    // HUB suelto: no se muestra si Embudos ya lo incluye.
    var hub = document.querySelector('[data-svc="HUB"]');
    if (hub) hub.hidden = elegido('EMBUDOS');
    Object.keys(UPSELL_DE).forEach(function (padre) {
      var sw = document.querySelector('[data-upsell="' + UPSELL_DE[padre] + '"]');
      if (!sw) return;
      sw.checked = elegido(UPSELL_DE[padre]);
      sw.disabled = !elegido(padre); // R-EMAIL: sin el padre no se puede elegir
    });
    document.querySelectorAll('[data-plataforma]').forEach(function (b) {
      var i = estado.plataformas.indexOf(b.getAttribute('data-plataforma'));
      b.setAttribute('aria-pressed', String(i !== -1));
      b.classList.toggle('es-base', i === 0);
    });
    var activo = document.getElementById('redes-activo');
    if (activo) {
      activo.checked = !!estado.pack;
      document.querySelector('[data-extra="REDES"]').hidden = !estado.pack;
      document.querySelectorAll('[data-pack]').forEach(function (r) { r.checked = r.getAttribute('data-pack') === estado.pack; });
      document.querySelectorAll('[data-red]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(estado.redes.indexOf(b.getAttribute('data-red')) !== -1));
      });
      document.getElementById('redes-precio').textContent = 'desde ' + precioTexto(porCodigo[PACKS[0]]);
    }
    var bonif = document.querySelector('[data-bonificar="WEB_INST"]');
    if (bonif) bonif.checked = !!estado.bonificar.WEB_INST;
    document.getElementById('descuento').checked = estado.descuento;
    document.getElementById('descuento-aviso').hidden = !estado.descuento;
    document.getElementById('resumen').setAttribute('data-moneda', estado.moneda);
    document.querySelectorAll('[data-moneda-vista]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-moneda-vista') === estado.moneda));
    });
    dinamicos.forEach(function (f) { f(); });
  }

  // ---------- Compartir por URL ----------
  function lista(v) { return v.map(encodeURIComponent).join(','); }
  function queryDeEstado() {
    var e = entrada();
    var q = [];
    var s = e.servicios.filter(function (c) { return !Q.REDES_PACKS[c]; });
    if (s.length) q.push('s=' + lista(s));
    if (e.plataformas.length) q.push('p=' + lista(e.plataformas));
    if (estado.pack) {
      q.push('n=' + encodeURIComponent(nivelDe(estado.pack)));
      if (estado.redes.length) q.push('r=' + lista(estado.redes));
    }
    var h = Object.keys(e.horas).filter(function (c) { return e.horas[c]; }).map(function (c) { return c + ':' + e.horas[c]; });
    if (h.length) q.push('h=' + lista(h));
    Object.keys(e.precios).forEach(function (c) {
      var p = e.precios[c];
      var partes = ['ARS', 'USD'].filter(function (m) { return p[m]; }).map(function (m) { return m + ':' + p[m]; });
      if (partes.length) q.push('c=' + lista([c].concat(partes)));
    });
    if (e.bonificar.length) q.push('b=' + lista(e.bonificar));
    if (e.descuentoExtraordinario) q.push('d=1');
    if (estado.moneda !== 'ARS') q.push('m=' + estado.moneda);
    return q.length ? '?' + q.join('&') : '';
  }

  function leerQuery() {
    var qs = new URLSearchParams(window.location.search);
    function partes(k) {
      return (qs.get(k) || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    }
    var cartaCodigos = [];
    CATEGORIAS.forEach(function (cat) { (cat.codigos || []).forEach(function (c) { cartaCodigos.push(c); }); });
    partes('s').forEach(function (c) {
      c = c.toUpperCase();
      if (cartaCodigos.indexOf(c) !== -1 || UPSELL[c]) { if (!elegido(c)) estado.sel.push(c); }
      else if (Q.REDES_PACKS[c] && porCodigo[c]) estado.pack = c;
    });
    // R-EMAIL: el upsell sin su padre no entra
    estado.sel = estado.sel.filter(function (c) { return !UPSELL[c] || elegido(UPSELL[c]); });
    if (elegido('PAUTA')) {
      partes('p').forEach(function (p) {
        if (tarifario.plataformas.indexOf(p) !== -1 && estado.plataformas.indexOf(p) === -1) estado.plataformas.push(p);
      });
      if (!estado.plataformas.length) estado.plataformas = [tarifario.plataformas[0]];
    }
    var n = (qs.get('n') || '').trim().toLowerCase();
    if (n) PACKS.forEach(function (p) { if (nivelDe(p).toLowerCase() === n) estado.pack = p; });
    if (estado.pack) {
      partes('r').forEach(function (r) {
        var ok = REDES.filter(function (x) { return x.toLowerCase() === r.toLowerCase(); })[0];
        if (ok && estado.redes.indexOf(ok) === -1) estado.redes.push(ok);
      });
    }
    partes('h').forEach(function (par) {
      var m = par.split(':');
      var c = (m[0] || '').toUpperCase();
      if (porCodigo[c] && porCodigo[c].modalidad === 'hora' && C.leerNumero(m[1])) estado.horas[c] = m[1];
    });
    var cap = partes('c');
    if (cap.length && porCodigo[cap[0].toUpperCase()] && porCodigo[cap[0].toUpperCase()].caso_a_caso) {
      var cc = cap[0].toUpperCase();
      estado.precios[cc] = estado.precios[cc] || { ARS: '', USD: '' };
      cap.slice(1).forEach(function (par) {
        var m = par.split(':');
        if ((m[0] === 'ARS' || m[0] === 'USD') && C.leerNumero(m[1])) estado.precios[cc][m[0]] = m[1];
      });
    }
    partes('b').forEach(function (b) { if (Object.prototype.hasOwnProperty.call(estado.bonificar, b.toUpperCase())) estado.bonificar[b.toUpperCase()] = true; });
    estado.descuento = qs.get('d') === '1';
    if (qs.get('m') === 'USD') estado.moneda = 'USD';
  }

  function linkActual() {
    return window.location.origin + window.location.pathname + queryDeEstado();
  }
  function actualizarUrl() {
    try { window.history.replaceState(null, '', window.location.pathname + queryDeEstado()); } catch (e) { /* archivo local */ }
  }

  function render() {
    var e = entrada();
    var r = Q.calcularAmbas(tarifario, e);
    pintarControles();
    pintarDesglose();
    pintarTotales(r);
    pintarLineas(r);
    pintarAvisos(r);
    document.getElementById('comando').textContent = Q.comando(tarifario, e, estado.moneda);
    actualizarUrl();
  }

  // ---------- Hoja inferior (celular) ----------
  var toggle = document.getElementById('resumen-toggle');
  var velo = document.getElementById('resumen-velo');
  function abrirHoja(abrir) {
    toggle.setAttribute('aria-expanded', String(abrir));
    document.getElementById('resumen').classList.toggle('abierto', abrir);
    velo.hidden = !abrir;
    document.body.classList.toggle('hoja-abierta', abrir);
  }

  // ---------- Eventos ----------
  function alternar(arr, v) {
    var i = arr.indexOf(v);
    if (i === -1) arr.push(v); else arr.splice(i, 1);
  }

  function enlazar() {
    var carta = document.getElementById('carta');
    carta.addEventListener('change', function (ev) {
      var t = ev.target;
      var c = t.getAttribute('data-codigo');
      if (c) {
        alternar(estado.sel, c);
        if (c === 'PAUTA' && elegido('PAUTA') && !estado.plataformas.length) estado.plataformas = [tarifario.plataformas[0]];
        if (c === 'EMBUDOS' && elegido('EMBUDOS')) estado.sel = estado.sel.filter(function (x) { return x !== 'HUB'; });
        if (UPSELL_DE[c] && !elegido(c)) estado.sel = estado.sel.filter(function (x) { return x !== UPSELL_DE[c]; });
        render();
        return;
      }
      var up = t.getAttribute('data-upsell');
      if (up) {
        if (elegido(UPSELL[up])) { if (t.checked && !elegido(up)) estado.sel.push(up); if (!t.checked) alternar(estado.sel, up); }
        render();
        return;
      }
      if (t.id === 'redes-activo') {
        estado.pack = t.checked ? PACKS[0] : null;
        if (!t.checked) estado.redes = [];
        render();
        return;
      }
      var pack = t.getAttribute('data-pack');
      if (pack) { estado.pack = pack; render(); return; } // las redes elegidas se recalculan en el nuevo nivel
      var b = t.getAttribute('data-bonificar');
      if (b) { estado.bonificar[b] = t.checked; render(); }
    });
    carta.addEventListener('input', function (ev) {
      var t = ev.target;
      var h = t.getAttribute('data-horas');
      if (h) { estado.horas[h] = t.value; render(); return; }
      var p = t.getAttribute('data-precio');
      if (p) { estado.precios[p][t.getAttribute('data-moneda')] = t.value; render(); }
    });
    carta.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-plataforma]');
      if (b) { alternar(estado.plataformas, b.getAttribute('data-plataforma')); render(); return; }
      var r = ev.target.closest('[data-red]');
      if (r) { alternar(estado.redes, r.getAttribute('data-red')); render(); }
    });
    document.getElementById('descuento').addEventListener('change', function (ev) { estado.descuento = ev.target.checked; render(); });
    document.querySelectorAll('[data-moneda-vista]').forEach(function (b) {
      b.addEventListener('click', function () { estado.moneda = b.getAttribute('data-moneda-vista'); render(); });
    });
    document.getElementById('btn-limpiar').addEventListener('click', function () {
      var moneda = estado.moneda;
      estado = estadoInicial();
      estado.moneda = moneda;
      document.querySelectorAll('[data-horas]').forEach(function (i) { i.value = estado.horas[i.getAttribute('data-horas')]; });
      document.querySelectorAll('[data-precio]').forEach(function (i) { i.value = ''; });
      render();
    });
    toggle.addEventListener('click', function () { abrirHoja(toggle.getAttribute('aria-expanded') !== 'true'); });
    velo.addEventListener('click', function () { abrirHoja(false); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { abrirHoja(false); toggle.focus(); }
    });
    var estadoCmd = document.getElementById('estado-comando');
    document.getElementById('btn-copiar-comando').addEventListener('click', function () {
      C.copiar(document.getElementById('comando').textContent)
        .then(function () { C.avisarCopia(estadoCmd, 'Comando copiado'); })
        .catch(function () { C.avisarCopia(estadoCmd, 'No se pudo copiar: selecciónalo a mano', true); });
    });
    var estadoLink = document.getElementById('estado-compartir');
    document.getElementById('btn-compartir').addEventListener('click', function () {
      C.copiar(linkActual())
        .then(function () { C.avisarCopia(estadoLink, 'Link copiado'); })
        .catch(function () { C.avisarCopia(estadoLink, 'No se pudo copiar: copia la dirección del navegador', true); });
    });
  }

  document.getElementById('descuento-titulo').textContent = 'Descuento extraordinario ' + pctTexto;
  pintarCarta();
  pintarPromo();
  leerQuery();
  // Valores de campos que vienen del link
  document.querySelectorAll('[data-horas]').forEach(function (i) { i.value = estado.horas[i.getAttribute('data-horas')]; });
  document.querySelectorAll('[data-precio]').forEach(function (i) {
    var p = estado.precios[i.getAttribute('data-precio')] || {};
    i.value = p[i.getAttribute('data-moneda')] || '';
  });
  abrirCategoriasElegidas();
  enlazar();
  render();
  window.MMGPrecotizadora = { link: linkActual };
  document.documentElement.setAttribute('data-listo', 'true');
})();
