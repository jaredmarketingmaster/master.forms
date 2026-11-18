/*
 * Test de paridad de la INTERFAZ (Playwright). Sirve docs/ bajo /master.forms/ (igual que
 * GitHub Pages), carga cada caso de casos_paridad.json haciendo clic en la pantalla real y lee
 * los totales y las líneas que muestra. Corre a 390×844 y a 1440×900.
 * Además prueba el Master de Forms (link armado, bloqueo de datos personales, copiar).
 * Uso: node tools/test_ui.js [--json salida.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

function cargarPlaywright() {
  try { return require('playwright'); } catch (e) { /* sigue */ }
  const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(raiz, 'playwright'));
}
const { chromium } = cargarPlaywright();

const PROJ = path.resolve(__dirname, '..');
const DOCS = path.join(PROJ, 'docs');
const PREFIJO = '/master.forms/';
const TOL_TOTAL = 0.005;
const TOL_LINEA = 0.011;
const TOTALES = ['fee_mensual', 'setup_y_unicos', 'primer_pago_mes_1'];
const casos = JSON.parse(fs.readFileSync(path.join(DOCS, 'data', 'casos_paridad.json'), 'utf8')).casos;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function servidor() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (!url.startsWith(PREFIJO)) { res.writeHead(404); return res.end('fuera de la subruta'); }
      let rel = url.slice(PREFIJO.length) || 'index.html';
      const file = path.join(DOCS, rel);
      if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const fallas = [];
const falla = (vista, caso, msg) => fallas.push({ vista, caso, detalle: msg });

async function aplicarCaso(page, c) {
  for (const cod of c.servicios || []) {
    const cb = page.locator(`input[data-codigo="${cod}"]`);
    if (await cb.count()) await cb.check();
  }
  if ((c.servicios || []).includes('PAUTA')) {
    const objetivo = c.plataformas || [];
    for (const b of await page.locator('[data-plataforma]').all()) {
      const p = await b.getAttribute('data-plataforma');
      if (!objetivo.includes(p) && (await b.getAttribute('aria-pressed')) === 'true') await b.click();
    }
    for (const p of objetivo) {
      const b = page.locator(`[data-plataforma="${p}"]`);
      if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    }
  }
  for (const [cod, h] of Object.entries(c.horas || {})) await page.fill(`[data-horas="${cod}"]`, String(h));
  for (const [cod, pm] of Object.entries(c.precio_caso_a_caso || {})) {
    for (const [mon, v] of Object.entries(pm)) await page.fill(`[data-precio="${cod}"][data-moneda="${mon}"]`, String(v));
  }
  for (const cod of c.bonificar || []) await page.locator(`[data-bonificar="${cod}"]`).check();
  if (c.descuento_extraordinario) await page.locator('#descuento').check();
}

async function leerPantalla(page) {
  return page.evaluate(() => {
    const tot = {};
    document.querySelectorAll('[data-total]').forEach((td) => {
      tot[td.dataset.moneda] = tot[td.dataset.moneda] || {};
      tot[td.dataset.moneda][td.dataset.total] = Number(td.dataset.valor);
    });
    const lineas = [...document.querySelectorAll('#lineas tr[data-codigo]')].map((tr) => ({
      codigo: tr.dataset.codigo, bonificada: tr.dataset.bonificada === 'true',
      ARS: { neto: tr.dataset.netoArs === '' ? null : Number(tr.dataset.netoArs), lista: Number(tr.dataset.listaArs) },
      USD: { neto: tr.dataset.netoUsd === '' ? null : Number(tr.dataset.netoUsd), lista: Number(tr.dataset.listaUsd) }
    }));
    const avisos = [...document.querySelectorAll('#avisos li')].map((li) => li.textContent);
    return { tot, lineas, avisos, comando: document.getElementById('comando').textContent,
      desbordeX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

async function probarPrecotizadora(ctx, base, vista) {
  let ok = 0;
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  for (const c of casos) {
    await page.goto(base + 'index.html');
    await page.waitForSelector('html[data-listo="true"]');
    await aplicarCaso(page, c);
    const r = await leerPantalla(page);
    let casoOk = true;
    for (const mon of ['ARS', 'USD']) {
      const esp = c.esperado[mon];
      for (const k of TOTALES) {
        const d = Math.abs(r.tot[mon][k] - Number(esp[k]));
        if (!(d < TOL_TOTAL)) { casoOk = false; falla(vista, c.id, `${mon} ${k}: pantalla ${r.tot[mon][k]} vs ${esp[k]}`); }
      }
      const porCod = Object.fromEntries(r.lineas.map((l) => [l.codigo, l]));
      if (r.lineas.length !== esp.lineas.length) { casoOk = false; falla(vista, c.id, `${mon}: ${r.lineas.length} líneas en pantalla vs ${esp.lineas.length}`); }
      for (const le of esp.lineas) {
        const l = porCod[le.codigo];
        if (!l) { casoOk = false; falla(vista, c.id, `${mon}: falta la línea ${le.codigo}`); continue; }
        if (l.bonificada !== le.bonificada) { casoOk = false; falla(vista, c.id, `${le.codigo} bonificada ${l.bonificada} vs ${le.bonificada}`); }
        if (l[mon].neto === null || !(Math.abs(l[mon].neto - le.neto) < TOL_LINEA)) { casoOk = false; falla(vista, c.id, `${mon} ${le.codigo} neto ${l[mon].neto} vs ${le.neto}`); }
        if (!(Math.abs(l[mon].lista - le.lista) < TOL_LINEA)) { casoOk = false; falla(vista, c.id, `${mon} ${le.codigo} lista ${l[mon].lista} vs ${le.lista}`); }
      }
    }
    const pideP2 = (c.esperado.ARS.advertencias_del_cotizador || []).some((a) => a.startsWith('Descuento extraordinario'));
    const muestraP2 = r.avisos.some((a) => a.includes('requiere OK de Jared'));
    if (pideP2 !== muestraP2) { casoOk = false; falla(vista, c.id, `advertencia P2: esperada ${pideP2}, en pantalla ${muestraP2}`); }
    if (pideP2 && !(await page.locator('#descuento-aviso').isVisible())) { casoOk = false; falla(vista, c.id, 'el aviso del descuento no se ve junto al interruptor'); }
    if (!r.comando.startsWith('python _engine/quote_calculator.py --cliente <slug> --servicios ')) { casoOk = false; falla(vista, c.id, `comando inesperado: ${r.comando}`); }
    if (c.descuento_extraordinario && !r.comando.includes('--descuento-extraordinario')) { casoOk = false; falla(vista, c.id, 'el comando no lleva --descuento-extraordinario'); }
    if (r.desbordeX) { casoOk = false; falla(vista, c.id, 'scroll horizontal en la página'); }
    if (casoOk) ok++;
  }
  // Copiar comando
  await page.goto(base + 'index.html');
  await page.waitForSelector('html[data-listo="true"]');
  await page.locator('input[data-codigo="PAUTA"]').check();
  await page.locator('[data-plataforma="Google Ads"]').click();
  await page.locator('input[data-codigo="CREATIVOS"]').check();
  await page.click('#btn-copiar-comando');
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  const esperado = 'python _engine/quote_calculator.py --cliente <slug> --servicios PAUTA,CREATIVOS --moneda ARS --plataformas "Meta Ads,Google Ads"';
  if (copiado !== esperado) falla(vista, 'copiar_comando', `portapapeles: ${copiado}`);
  if (!(await page.locator('#estado-comando').textContent()).includes('copiado')) falla(vista, 'copiar_comando', 'sin confirmación visible');
  if (errores.length) falla(vista, 'consola', errores.join(' | '));
  await page.close();
  return ok;
}

async function probarForms(ctx, base, vista) {
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(base + 'forms.html');
  await page.waitForSelector('html[data-listo="true"]');
  const cards = page.locator('[data-form]');
  if ((await cards.count()) !== 2) falla(vista, 'forms', `se esperaban 2 tarjetas, hay ${await cards.count()}`);
  const card = page.locator('[data-form="brief-crecimiento"]');
  const boton = card.getByRole('button', { name: 'Copiar link' });
  if (!(await boton.isDisabled())) falla(vista, 'forms', 'sin servicios el botón debería estar deshabilitado');
  if (!(await card.textContent()).includes('En construcción')) falla(vista, 'forms', 'no se ve el estado En construcción');
  await card.locator('input[value="pauta"]').check({ force: true });
  await card.locator('input[value="creativos"]').check({ force: true });
  const link0 = await card.locator('.link-armado').textContent();
  if (link0 !== 'https://example.com/mmg/brief-de-crecimiento?s=pauta,creativos') falla(vista, 'forms', `sin nombre: ${link0}`);
  await card.locator('input[type="text"]').fill('Panadería Ejemplo & Hijos');
  const link1 = await card.locator('.link-armado').textContent();
  const esp1 = 'https://example.com/mmg/brief-de-crecimiento?n=Panader%C3%ADa%20Ejemplo%20%26%20Hijos&s=pauta,creativos';
  if (link1 !== esp1) falla(vista, 'forms', `con nombre: ${link1}`);
  await boton.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (clip !== esp1) falla(vista, 'forms', `portapapeles: ${clip}`);
  if (!(await card.locator('.estado-copia').textContent()).includes('Link copiado')) falla(vista, 'forms', 'sin confirmación visible');
  for (const malo of ['ventas@empresa.com', 'Tienda 11 5555 1234', 'www.tienda.com']) {
    await card.locator('input[type="text"]').fill(malo);
    if (!(await boton.isDisabled())) falla(vista, 'forms', `dato personal no bloqueado: ${malo}`);
    const l = await card.locator('.link-armado').textContent();
    if (l.includes('n=')) falla(vista, 'forms', `dato personal en la URL: ${l}`);
  }
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (desborde) falla(vista, 'forms', 'scroll horizontal');
  if (errores.length) falla(vista, 'forms-consola', errores.join(' | '));
  await page.close();
}

const iCap = process.argv.indexOf('--capturas');
const dirCapturas = iCap !== -1 ? process.argv[iCap + 1] : null;

/** Capturas de entrega con datos cargados: caso completo_desc y un link armado. */
async function capturar(ctx, base, vista, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  await page.goto(base + 'index.html');
  await page.waitForSelector('html[data-listo="true"]');
  await aplicarCaso(page, casos.find((c) => c.id === 'completo_desc'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `precotizadora_${vista}.png`), fullPage: true });
  await page.goto(base + 'forms.html');
  await page.waitForSelector('html[data-listo="true"]');
  const card = page.locator('[data-form="brief-crecimiento"]');
  await card.locator('input[type="text"]').fill('Panadería Ejemplo');
  await card.locator('input[value="pauta"]').check({ force: true });
  await card.locator('input[value="creativos"]').check({ force: true });
  await card.getByRole('button', { name: 'Copiar link' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `forms_${vista}.png`), fullPage: true });
  await page.close();
}

(async () => {
  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}${PREFIJO}`;
  const browser = await chromium.launch();
  const vistas = { '390x844': { width: 390, height: 844, mobile: true }, '1440x900': { width: 1440, height: 900, mobile: false } };
  const resumen = {};
  for (const [nombre, v] of Object.entries(vistas)) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile,
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const ok = await probarPrecotizadora(ctx, base, nombre);
    await probarForms(ctx, base, nombre);
    if (dirCapturas) await capturar(ctx, base, nombre, dirCapturas);
    resumen[nombre] = ok;
    console.log(`Interfaz ${nombre}: ${ok}/${casos.length} casos OK en pantalla (ARS y USD por caso)`);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  if (fallas.length) {
    console.log(`\n${fallas.length} falla(s):`);
    fallas.forEach((f) => console.log(`  - [${f.vista} · ${f.caso}] ${f.detalle}`));
  }
  console.log(`Resultado interfaz: ${fallas.length ? 'NO PASA' : 'PASA'}`);
  const iOut = process.argv.indexOf('--json');
  if (iOut !== -1 && process.argv[iOut + 1]) {
    fs.writeFileSync(process.argv[iOut + 1], JSON.stringify({ tipo: 'interfaz', casos: casos.length, resumen, fallas }, null, 2));
  }
  process.exit(fallas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
