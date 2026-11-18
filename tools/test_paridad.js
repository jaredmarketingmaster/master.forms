/*
 * Test de paridad del motor (Node). Recorre docs/data/casos_paridad.json y compara con
 * docs/assets/js/cotizador.js — el mismo archivo que sirve GitHub Pages.
 * Tolerancias: totales < 0,005 · neto (y lista) de cada línea < 0,011.
 * También verifica que docs/ tenga la copia exacta del tarifario y de los casos de MMG
 * y que el tarifario incrustado en index.html sea el mismo.
 * Uso: node tools/test_paridad.js [--json salida.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const DOCS = path.join(PROJ, 'docs');
// clientes/mmg_centro_de_mando → 02_Web_Dev → raíz de la agencia
const MMG = process.env.MMG_PRECOTIZADORA_DIR ||
  path.resolve(PROJ, '..', '..', '..', 'MMG_Base_Operaciones', '_boveda_mmg', 'precotizadora');
const TOL_TOTAL = 0.005;
const TOL_LINEA = 0.011;
const TOTALES = ['fee_mensual', 'setup_y_unicos', 'primer_pago_mes_1'];

const Q = require(path.join(DOCS, 'assets', 'js', 'cotizador.js'));
const tarRaw = fs.readFileSync(path.join(DOCS, 'data', 'tarifario_v1.json'));
const casosRaw = fs.readFileSync(path.join(DOCS, 'data', 'casos_paridad.json'));
const tarifario = JSON.parse(tarRaw.toString('utf8'));
const casos = JSON.parse(casosRaw.toString('utf8')).casos;

const fallas = [];
function falla(id, moneda, msg) { fallas.push({ caso: id, moneda, detalle: msg }); }

// 1) Copias exactas desde MMG e incrustación en el HTML
if (fs.existsSync(MMG)) {
  for (const f of ['tarifario_v1.json', 'casos_paridad.json']) {
    const a = fs.readFileSync(path.join(MMG, f));
    const b = fs.readFileSync(path.join(DOCS, 'data', f));
    if (!a.equals(b)) falla('—', '—', `docs/data/${f} no es copia exacta del archivo de MMG: correr tools/build.py`);
  }
} else {
  console.warn(`AVISO: no se encontró ${MMG}; se omite la comparación byte a byte con MMG.`);
}
const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
const m = html.match(/<script type="application\/json" id="datos-tarifario">([\s\S]*?)<\/script>/);
if (!m) falla('—', '—', 'index.html no trae el bloque datos-tarifario');
else if (JSON.stringify(JSON.parse(m[1].replace(/<\\\//g, '</'))) !== JSON.stringify(tarifario)) {
  falla('—', '—', 'el tarifario incrustado en index.html no coincide con docs/data/tarifario_v1.json');
}

// 2) Casos
function entradaDe(c) {
  return {
    servicios: c.servicios || [],
    plataformas: c.plataformas || [],
    horas: c.horas || {},
    precios: c.precio_caso_a_caso || {},
    bonificar: c.bonificar || [],
    descuentoExtraordinario: !!c.descuento_extraordinario
  };
}

const filas = [];
let comparaciones = 0;
for (const c of casos) {
  for (const moneda of ['ARS', 'USD']) {
    const esp = c.esperado[moneda];
    const r = Q.calcular(tarifario, entradaDe(c), moneda);
    let ok = true;
    const diffTot = {};
    for (const k of TOTALES) {
      const d = Math.abs(r.totales[k] - Number(esp[k]));
      diffTot[k] = d;
      comparaciones++;
      if (!(d < TOL_TOTAL)) { ok = false; falla(c.id, moneda, `${k}: app ${r.totales[k]} vs esperado ${esp[k]} (dif ${d})`); }
    }
    if (r.lineas.length !== esp.lineas.length) {
      ok = false;
      falla(c.id, moneda, `cantidad de líneas: app ${r.lineas.length} vs esperado ${esp.lineas.length}`);
    }
    esp.lineas.forEach((le, i) => {
      const la = r.lineas[i];
      if (!la) return;
      const checks = [
        ['codigo', la.codigo === le.codigo, `${la.codigo} vs ${le.codigo}`],
        ['cantidad', Math.abs(la.cantidad - le.cantidad) < 1e-9, `${la.cantidad} vs ${le.cantidad}`],
        ['bonificada', la.bonificada === le.bonificada, `${la.bonificada} vs ${le.bonificada}`],
        ['descuento_pct', Math.abs(la.descuento_pct - le.descuento_pct) < 1e-9, `${la.descuento_pct} vs ${le.descuento_pct}`],
        ['lista', la.lista !== null && Math.abs(la.lista - le.lista) < TOL_LINEA, `${la.lista} vs ${le.lista}`],
        ['neto', !la.pendiente && Math.abs(la.neto - le.neto) < TOL_LINEA, `${la.neto} vs ${le.neto}`]
      ];
      for (const [campo, pasa, det] of checks) {
        comparaciones++;
        if (!pasa) { ok = false; falla(c.id, moneda, `línea ${i + 1} ${le.codigo} · ${campo}: ${det}`); }
      }
    });
    filas.push({ caso: c.id, moneda, ok, totales: r.totales, dif_max_total: Math.max(...Object.values(diffTot)) });
  }
}

// 3) Reporte
const pad = (s, n) => String(s).padEnd(n);
console.log(`Paridad del motor · ${casos.length} casos × 2 monedas = ${filas.length} corridas · ${comparaciones} comparaciones`);
for (const f of filas) {
  console.log(`  ${f.ok ? 'OK ' : 'FALLA'} ${pad(f.caso, 28)} ${f.moneda}  fee ${pad(f.totales.fee_mensual, 10)} únicos ${pad(f.totales.setup_y_unicos, 10)} mes 1 ${pad(f.totales.primer_pago_mes_1, 10)} dif.máx ${f.dif_max_total.toExponential(1)}`);
}
if (fallas.length) {
  console.log(`\n${fallas.length} falla(s):`);
  fallas.forEach((f) => console.log(`  - [${f.caso} · ${f.moneda}] ${f.detalle}`));
}
const okCount = filas.filter((f) => f.ok).length;
console.log(`\nResultado: ${okCount}/${filas.length} corridas OK · ${fallas.length ? 'NO PASA' : 'PASA'}`);

const iOut = process.argv.indexOf('--json');
if (iOut !== -1 && process.argv[iOut + 1]) {
  fs.writeFileSync(process.argv[iOut + 1], JSON.stringify({ tipo: 'motor', corridas: filas.length, ok: okCount, fallas }, null, 2));
}
process.exit(fallas.length ? 1 : 0);
