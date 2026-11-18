# Centro de Mando MMG · v1

Herramienta interna de Marketing Masters Group, pensada para el celular. Tres pantallas:

1. **Precotizadora**: calcula en segundos el fee mensual, los pagos únicos y el primer pago, en ARS y en USD. No guarda, no exporta y no pide datos del cliente.
2. **Master de Forms**: arma en un clic el link del formulario de onboarding (`?n=<nombre comercial>&s=<servicios>`). En la URL nunca van emails, teléfonos ni otros datos personales.
3. **Teleprompter**: pegas o abres un guion (.txt), eliges la velocidad en palabras por minuto y lo lees a pantalla completa: fondo blanco, letra gris y una columna centrada del 40 % del ancho (90 % en el celular), que sube a ritmo constante. Además trae cuenta regresiva, línea guía, modo espejo, tamaño de letra, indicaciones `[entre corchetes]` que no cuentan para el tiempo, tiempo restante, pantalla siempre encendida (Wake Lock) y atajos de teclado (Espacio, ↑ ↓, ← →, + −, Inicio, Esc). El guion no se guarda: si recargas la página, se pierde y el navegador avisa antes.

En vivo: <https://jaredmarketingmaster.github.io/master.forms/>

## Regla de oro

La app no tiene precios ni reglas propias. Lee dos archivos que genera `MMG_Base_Operaciones/_engine/export_precotizadora.py`:

- `tarifario_v1.json`: servicios, precios en ARS y USD, constantes y reglas.
- `casos_paridad.json`: 22 casos calculados por `quote_calculator.py`.

`tools/build.py` los copia tal cual a `docs/data/` en cada build y **no escribe nunca en MMG**. Si el tarifario trae una regla nueva que `cotizador.js` no implementa, el build falla.

## Estructura

```text
src/                 fuente (HTML, CSS, JS, forms.config.json, isotipo MMG)
docs/                GENERADO: lo que sirve GitHub Pages (no editar a mano)
tools/build.py       src/ + datos de MMG + tokens de marca → docs/
tools/test_paridad.js  paridad del motor: 22 casos × 2 monedas
tools/test_ui.js     paridad de la interfaz con Playwright a 390 y 1440 + Master de Forms + Teleprompter
tools/verificar.py   gate: build → paridad → qa_web.py. Sin "APTO PARA PUSH" no se publica.
```

Los tokens de marca (fondo blanco, azul noche `#2D3748`, azul de acción `#1A73E8`, Lato + Bahnschrift/Barlow Semi Condensed) salen del dossier `marketing_master` de la Fábrica, vía `clientes/marketing_master/site_config.json`. Se leen, no se mezclan.

## Publicar un cambio

```powershell
python tools/verificar.py
```

Con `VEREDICTO: APTO PARA PUSH`: commit y push a `main`, sin force-push. GitHub Pages publica solo.

**Configuración de Pages (una vez):** Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch: `main` · carpeta **`/docs`** → Save.

## Excepciones al estándar de landings (herramienta interna)

No lleva GTM, Pixel, GA4, Clarity, `dataLayer`, `dtr_and_tracking.js` ni `data-cta`. Sí lleva `noindex, nofollow`. `qa_web.py` marca esa ausencia y `tools/verificar.py` la acepta de forma explícita (lista `EXCEPCIONES`). Cualquier otro error del QA bloquea la publicación.

Seguridad, dentro de lo que permite un sitio estático en Pages:

- CSP por `<meta>`: sin scripts de terceros, sin `connect-src` y sin formularios.
- `referrer: no-referrer`.
- Sin `localStorage` ni servidor.
- GitHub Pages no deja configurar cabeceras HTTP como HSTS o `frame-ancestors`.

## Acceso privado

GitHub Pages en una cuenta personal es público, y este repo también lo es: el tarifario se puede leer en `docs/data/`. Una "contraseña" en JavaScript del navegador sería solo un obstáculo, no seguridad, y por eso no se implementó. Opciones reales en `ACCESO_PRIVADO.md`.
