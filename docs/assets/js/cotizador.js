/*
 * Motor de la Precotizadora MMG.
 *
 * No tiene precios ni reglas propias: todo sale de tarifario_v1.json (generado por
 * MMG_Base_Operaciones/_engine/export_precotizadora.py). Este archivo implementa las
 * reglas escritas en tarifario.reglas, en el mismo orden que quote_calculator.py:
 *   P1 · ICT_ARS · PLATAFORMAS · R-EMAIL · R-REDES · HUB_EN_EMBUDOS · LANDING_BONIF ·
 *   BONIFICAR · HORAS · CASO_A_CASO · P2 · TOTALES
 *
 * Lo usan la app (navegador) y el test de paridad (Node) — es el mismo archivo.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MMGCotizador = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONEDAS = ['ARS', 'USD'];
  var MOTIVO_HUB = 'Incluido en la Gestión de Embudos de Venta';
  var MOTIVO_LANDING = 'Bonificada al contratar Pauta + Embudos';
  var MOTIVO_BONIFICAR = 'Bonificado';
  var BONIFICABLES = ['WEB_INST']; // regla BONIFICAR
  var AUTOMATICOS = ['PAUTA_EXTRA']; // regla PLATAFORMAS: no se elige suelto
  // regla R-EMAIL: el upsell de email marketing solo va con su servicio padre
  var UPSELL_PADRE = { EMAIL_EMBUDOS: 'EMBUDOS', EMAIL_ECOMMERCE: 'ECOMMERCE' };
  // regla R-REDES: un solo pack; cada red adicional suma REDES_X_<RED>_<nivel> del mismo nivel
  var REDES_PACKS = { REDES_ESENCIAL: 'E', REDES_CRECIMIENTO: 'C', REDES_DOMINIO: 'D' };
  var PREFIJO_RED_X = 'REDES_X_'; // no se eligen sueltas

  /**
   * Red adicional → código del tarifario, leído de los propios servicios REDES_X_<RED>_<nivel>
   * ("Red adicional YouTube Shorts · Esencial" → { 'youtube shorts': { E: 'REDES_X_YOUTUBE_E', … } }).
   */
  function mapaRedes(tarifario) {
    var m = {};
    tarifario.servicios.forEach(function (s) {
      var c = s.codigo.match(/^REDES_X_(.+)_([A-Z])$/);
      var n = String(s.servicio).match(/^Red adicional (.+?) · /);
      if (!c || !n) return;
      var k = n[1].trim().toLowerCase();
      (m[k] = m[k] || {})[c[2]] = s.codigo;
    });
    return m;
  }

  // ---- Redondeo (regla TOTALES) -------------------------------------------------
  // Sin toFixed ni Math.round(x*100): se corre la coma con notación exponencial.
  function correr(x, dec) {
    var s = String(x);
    if (s.indexOf('e') !== -1 || s.indexOf('E') !== -1) {
      // Notación exponencial (valores ínfimos o enormes): se normaliza primero.
      s = Number(x).toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    }
    return Number(Math.round(Number(s + 'e' + dec)) + 'e-' + dec);
  }
  function redondear2(x) { return correr(x, 2); } // medio centavo hacia arriba
  function redondear6(x) { return correr(x, 6); }

  function indice(tarifario) {
    var m = {};
    tarifario.servicios.forEach(function (s) { m[s.codigo] = s; });
    return m;
  }

  function esNumeroValido(v) {
    return typeof v === 'number' && isFinite(v) && v > 0;
  }

  /** Precio unitario de lista en la moneda pedida, o null si falta. */
  function precioUnitario(t, moneda, entrada, tc) {
    if (t.caso_a_caso) {
      var p = (entrada.precios || {})[t.codigo] || {};
      var v = p[moneda];
      return esNumeroValido(v) ? v : null;
    }
    if (moneda === 'USD') return typeof t.usd === 'number' ? t.usd : null;
    if (typeof t.ars === 'number') return t.ars;
    if (t.ars_por_conversion && typeof t.usd === 'number') return t.usd * tc; // regla ICT_ARS
    return null;
  }

  /**
   * entrada = {
   *   servicios: ['PAUTA', 'EMBUDOS', ...],          // códigos elegidos, en orden
   *   plataformas: ['Meta Ads', 'Google Ads'],        // solo con PAUTA; la 1.ª es la base
   *   horas: { WEB_APP: 12, HORA: 2 },
   *   precios: { CAPACITACION: { ARS: 300000, USD: 200 } },
   *   bonificar: ['WEB_INST'],
   *   descuentoExtraordinario: false
   * }
   */
  function calcular(tarifario, entrada, moneda) {
    if (MONEDAS.indexOf(moneda) === -1) throw new Error('Moneda no soportada: ' + moneda);
    var tar = indice(tarifario);
    var cte = tarifario.constantes;
    var tc = cte.tc_ars_por_usd;
    var pctExtra = cte.descuento_extraordinario_pct;
    var advertencias = [];

    var codes = [];
    (entrada.servicios || []).forEach(function (c) {
      c = String(c).trim().toUpperCase();
      if (!tar[c] || AUTOMATICOS.indexOf(c) !== -1 || c.indexOf(PREFIJO_RED_X) === 0 || codes.indexOf(c) !== -1) return;
      codes.push(c);
    });
    var plataformas = (entrada.plataformas || []).filter(function (p) { return String(p).trim(); });

    // HORAS
    var qty = {};
    Object.keys(entrada.horas || {}).forEach(function (k) {
      qty[k.toUpperCase()] = Number(entrada.horas[k]);
    });

    // PLATAFORMAS
    if (codes.indexOf('PAUTA') !== -1) {
      var nPlat = Math.max(1, plataformas.length);
      if (nPlat > 1) {
        codes.splice(codes.indexOf('PAUTA') + 1, 0, 'PAUTA_EXTRA');
        qty.PAUTA_EXTRA = Math.max(1, nPlat - 1);
      }
      if (!plataformas.length) advertencias.push('Pauta sin plataformas elegidas: se cotiza solo la plataforma base.');
    }

    // R-EMAIL
    Object.keys(UPSELL_PADRE).forEach(function (up) {
      var padre = UPSELL_PADRE[up];
      if (codes.indexOf(up) !== -1 && codes.indexOf(padre) === -1) {
        codes.splice(codes.indexOf(up), 1);
        advertencias.push(tar[up].servicio + ': solo se cotiza junto con ' + tar[padre].servicio + '. No suma al total.');
      }
    });

    // R-REDES
    var packs = codes.filter(function (c) { return REDES_PACKS[c]; });
    packs.slice(1).forEach(function (p) {
      codes.splice(codes.indexOf(p), 1);
      advertencias.push('Un solo pack de redes por cotización: queda ' + tar[packs[0]].servicio + '.');
    });
    var redes = (entrada.redes || []).map(function (r) { return String(r).trim(); }).filter(Boolean);
    if (packs.length && redes.length) {
      var nivel = REDES_PACKS[packs[0]];
      var mapa = mapaRedes(tarifario);
      var pos = codes.indexOf(packs[0]) + 1;
      redes.forEach(function (r) {
        var code = (mapa[r.toLowerCase()] || {})[nivel];
        if (!code || !tar[code]) { advertencias.push('Red adicional desconocida: ' + r + '. No suma.'); return; }
        if (codes.indexOf(code) !== -1) return;
        codes.splice(pos, 0, code);
        pos++;
      });
    } else if (redes.length) {
      advertencias.push('Las redes adicionales necesitan un pack de redes sociales: no suman.');
    }

    // HUB_EN_EMBUDOS · LANDING_BONIF · BONIFICAR
    var bonif = {};
    if (codes.indexOf('EMBUDOS') !== -1) {
      if (codes.indexOf('HUB') === -1) codes.splice(codes.indexOf('EMBUDOS') + 1, 0, 'HUB');
      bonif.HUB = MOTIVO_HUB;
    }
    if (codes.indexOf('PAUTA') !== -1 && codes.indexOf('EMBUDOS') !== -1 && codes.indexOf('LANDING') !== -1) {
      bonif.LANDING = MOTIVO_LANDING;
    }
    (entrada.bonificar || []).forEach(function (b) {
      b = String(b).trim().toUpperCase();
      if (BONIFICABLES.indexOf(b) === -1) return;
      if (codes.indexOf(b) === -1) codes.push(b);
      if (!bonif[b]) bonif[b] = MOTIVO_BONIFICAR;
    });

    var desc = !!entrada.descuentoExtraordinario;
    var lineas = [];
    var fee = 0, unicos = 0;

    codes.forEach(function (c) {
      var t = tar[c];
      var cantidad = qty[c] !== undefined ? qty[c] : 1;
      var unit = precioUnitario(t, moneda, entrada, tc);
      var linea = {
        codigo: c,
        servicio: t.servicio,
        modalidad: t.modalidad,
        cantidad: cantidad,
        lista: null,
        neto: 0,
        bonificada: false,
        motivo_bonificacion: null,
        descuento_pct: 0,
        pendiente: null
      };
      if (unit === null) {
        linea.pendiente = t.caso_a_caso ? 'Falta el precio en ' + moneda : 'Sin precio en ' + moneda;
        lineas.push(linea);
        return;
      }
      if (!(isFinite(cantidad) && cantidad > 0)) {
        linea.pendiente = 'Falta la cantidad de horas';
        lineas.push(linea);
        return;
      }
      var bruto = unit * cantidad;
      var bonificada = Object.prototype.hasOwnProperty.call(bonif, c);
      var d = 0;
      if (!bonificada && desc && t.admite_descuento_extraordinario) d = pctExtra; // P2
      var neto = bonificada ? 0 : bruto * (1 - d / 100);
      linea.lista = redondear6(bruto);
      linea.neto = redondear6(neto);
      linea.bonificada = bonificada;
      linea.motivo_bonificacion = bonificada ? bonif[c] : null;
      linea.descuento_pct = d;
      if (t.modalidad === 'mensual') fee += linea.neto;
      else unicos += linea.neto; // 'unico' y 'hora'
      lineas.push(linea);
    });

    lineas.forEach(function (l) {
      if (l.pendiente && l.codigo === 'CAPACITACION') {
        advertencias.push('Capacitación: carga el precio a mano en ' + moneda + ' (caso a caso). No suma al total.');
      } else if (l.pendiente) {
        advertencias.push(tar[l.codigo].servicio + ': ' + l.pendiente.toLowerCase() + '. No suma al total.');
      }
    });
    if (moneda === 'ARS' && lineas.some(function (l) { return tar[l.codigo].ars_por_conversion; })) {
      advertencias.push('I.C.T.: en ARS es USD × ' + formatoTc(tc) + ' (tipo de cambio de referencia del tarifario).');
    }

    return {
      moneda: moneda,
      lineas: lineas,
      totales: {
        fee_mensual: redondear2(fee),
        setup_y_unicos: redondear2(unicos),
        primer_pago_mes_1: redondear2(unicos + fee)
      },
      advertencias: advertencias
    };
  }

  function formatoTc(tc) {
    return String(tc).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function calcularAmbas(tarifario, entrada) {
    return { ARS: calcular(tarifario, entrada, 'ARS'), USD: calcular(tarifario, entrada, 'USD') };
  }

  /** Comando equivalente de quote_calculator.py (para pegarle a Claude). */
  function comando(tarifario, entrada, moneda) {
    var tar = indice(tarifario);
    var codes = [];
    (entrada.servicios || []).forEach(function (c) {
      c = String(c).toUpperCase();
      if (!tar[c] || AUTOMATICOS.indexOf(c) !== -1 || c.indexOf(PREFIJO_RED_X) === 0 || codes.indexOf(c) !== -1) return;
      if (UPSELL_PADRE[c] && (entrada.servicios || []).indexOf(UPSELL_PADRE[c]) === -1) return; // R-EMAIL
      if (c === 'HUB' && (entrada.servicios || []).indexOf('EMBUDOS') !== -1) return; // lo agrega el cotizador
      codes.push(c);
    });
    var partes = ['python _engine/quote_calculator.py', '--cliente <slug>',
      '--servicios ' + (codes.length ? codes.join(',') : '<servicios>'), '--moneda ' + moneda];
    if (codes.indexOf('PAUTA') !== -1 && (entrada.plataformas || []).length) {
      partes.push('--plataformas "' + entrada.plataformas.join(',') + '"');
    }
    var hayPack = codes.some(function (c) { return REDES_PACKS[c]; });
    if (hayPack && (entrada.redes || []).length) {
      partes.push('--redes "' + entrada.redes.join(',') + '"');
    }
    (entrada.bonificar || []).forEach(function (b) {
      if (codes.indexOf(b) !== -1 && BONIFICABLES.indexOf(b) !== -1) partes.push('--bonificar ' + b);
    });
    if (entrada.descuentoExtraordinario) partes.push('--descuento-extraordinario');
    codes.forEach(function (c) {
      if (tar[c].modalidad === 'hora') {
        var h = Number((entrada.horas || {})[c]);
        partes.push('--horas-codigo ' + c + '=' + (isFinite(h) && h > 0 ? String(h) : 'N'));
      }
    });
    codes.forEach(function (c) {
      if (tar[c].caso_a_caso) {
        var v = ((entrada.precios || {})[c] || {})[moneda];
        partes.push('--precio ' + c + '=' + (esNumeroValido(v) ? String(v) : 'N'));
      }
    });
    return partes.join(' ');
  }

  return {
    calcular: calcular,
    calcularAmbas: calcularAmbas,
    comando: comando,
    redondear2: redondear2,
    redondear6: redondear6,
    mapaRedes: mapaRedes,
    UPSELL_PADRE: UPSELL_PADRE,
    REDES_PACKS: REDES_PACKS,
    MONEDAS: MONEDAS
  };
});
