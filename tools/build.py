"""Build del Centro de Mando MMG: src/ → docs/ (carpeta que sirve GitHub Pages).

- Copia tarifario_v1.json y casos_paridad.json desde MMG_Base_Operaciones (solo lectura).
- Falla si el tarifario trae una regla que el motor todavía no implementa.
- Toma los tokens de marca de clientes/marketing_master/site_config.json (solo lectura).
- Inyecta los datos como bloques JSON en el HTML (funciona también abriendo el archivo local).
- Escribe .qa/site_config.qa.json para qa_web.py (sin tracking: herramienta interna).

Uso:  python tools/build.py
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

PROJ = Path(__file__).resolve().parents[1]
MODULE = PROJ.parents[1]  # 02_Web_Dev
SRC = PROJ / "src"
DOCS = PROJ / "docs"
QA_DIR = PROJ / ".qa"
AGENCIA = MODULE.parent  # carpeta raíz de la agencia (contiene 02_Web_Dev y MMG_Base_Operaciones)
MMG_DIR = Path(os.environ.get(
    "MMG_PRECOTIZADORA_DIR",
    AGENCIA / "MMG_Base_Operaciones" / "_boveda_mmg" / "precotizadora"))
MARCA_CFG = MODULE / "clientes" / "marketing_master" / "site_config.json"

PAGES_URL = "https://jaredmarketingmaster.github.io/master.forms/"
REGLAS_IMPLEMENTADAS = {"P1", "ICT_ARS", "PLATAFORMAS", "HUB_EN_EMBUDOS", "LANDING_BONIF",
                        "BONIFICAR", "HORAS", "CASO_A_CASO", "P2", "TOTALES"}
SERVICIOS_FORMS = {"pauta", "embudos", "creativos", "landing", "web", "webapp"}

# Roles de la app ← tokens del dossier marketing_master (02 §3.1 + brand_dna)
MAPA_TOKENS = {
    "--bg": "--bg-primary",
    "--surface": "--surface-card",
    "--raised": "--bg-secondary",
    "--border": "--border-subtle",
    "--night": "--bg-inverse",
    "--on-night": "--text-inverse",
    "--text": "--text-primary",
    "--muted": "--text-secondary",
    "--faint": "--text-muted",
    "--accent": "--accent-cta",
    "--accent-hover": "--accent-cta-hover",
    "--on-accent": "--accent-cta-text",
    "--positive": "--success",
    "--negative": "--error",
    "--font-text": "--font-body",
    "--font-display": "--font-mono",  # Bahnschrift / Barlow Semi Condensed
}


def fail(msg: str) -> None:
    print(f"ERROR build: {msg}", file=sys.stderr)
    sys.exit(1)


def leer_json(path: Path) -> tuple[bytes, dict]:
    if not path.exists():
        fail(f"no existe {path}")
    raw = path.read_bytes()
    try:
        return raw, json.loads(raw.decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        fail(f"JSON inválido en {path}: {e}")
    raise AssertionError


def validar_tarifario(t: dict) -> None:
    ids = {r.get("id") for r in t.get("reglas", [])}
    nuevas = ids - REGLAS_IMPLEMENTADAS
    if nuevas:
        fail(f"el tarifario trae reglas sin implementar en cotizador.js: {sorted(nuevas)}")
    faltan = REGLAS_IMPLEMENTADAS - ids
    if faltan:
        fail(f"el tarifario ya no trae las reglas {sorted(faltan)}: revisar el motor antes de publicar")
    for k in ("tc_ars_por_usd", "descuento_extraordinario_pct"):
        if not isinstance(t.get("constantes", {}).get(k), (int, float)):
            fail(f"constante faltante: {k}")
    for s in t.get("servicios", []):
        for k in ("codigo", "servicio", "modalidad", "caso_a_caso", "admite_descuento_extraordinario"):
            if k not in s:
                fail(f"servicio sin '{k}': {s}")
        if s["modalidad"] not in ("mensual", "unico", "hora"):
            fail(f"modalidad desconocida en {s['codigo']}: {s['modalidad']}")


def validar_forms(f: dict) -> None:
    for card in f.get("formularios", []):
        for k in ("id", "nombre", "descripcion", "url_base", "servicios", "estado"):
            if k not in card:
                fail(f"forms.config.json: tarjeta sin '{k}'")
        if not card["url_base"].startswith("https://") or "?" in card["url_base"]:
            fail(f"forms.config.json: url_base debe ser https y sin query: {card['url_base']}")
        raros = set(card["servicios"]) - SERVICIOS_FORMS
        if raros:
            fail(f"forms.config.json: servicios desconocidos {sorted(raros)}")


def json_en_html(data: dict) -> str:
    # Bloque de datos no ejecutable; se escapa '</' para que no cierre el <script>.
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def css_tokens(tokens: dict) -> str:
    lineas = ["/* GENERADO por tools/build.py desde clientes/marketing_master/site_config.json. No editar. */",
              ":root {"]
    for rol, origen in MAPA_TOKENS.items():
        if origen not in tokens:
            fail(f"token {origen} ausente en {MARCA_CFG}")
        lineas.append(f"  {rol}: {tokens[origen]};")
    lineas.append("}")
    return "\n".join(lineas) + "\n"


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    tar_raw, tarifario = leer_json(MMG_DIR / "tarifario_v1.json")
    casos_raw, casos = leer_json(MMG_DIR / "casos_paridad.json")
    forms_raw, forms = leer_json(SRC / "data" / "forms.config.json")
    _, marca = leer_json(MARCA_CFG)
    validar_tarifario(tarifario)
    validar_forms(forms)
    if not casos.get("casos"):
        fail("casos_paridad.json sin casos")

    if DOCS.exists():
        shutil.rmtree(DOCS)
    shutil.copytree(SRC / "assets", DOCS / "assets")
    (DOCS / "data").mkdir(parents=True)
    (DOCS / "data" / "tarifario_v1.json").write_bytes(tar_raw)
    (DOCS / "data" / "casos_paridad.json").write_bytes(casos_raw)
    (DOCS / "data" / "forms.config.json").write_bytes(forms_raw)
    (DOCS / "assets" / "css" / "tokens.css").write_text(css_tokens(marca["design"]["tokens"]), encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")

    ahora = dt.datetime.now()
    reemplazos = {
        "{{fonts.url}}": marca["design"]["google_fonts"]["url"].replace("&", "&amp;"),
        "{{pages.url}}": PAGES_URL,
        "{{tarifario.generado}}": tarifario["_meta"]["generado"].replace("T", " ")[:16],
        "{{tarifario.sha}}": hashlib.sha256(tar_raw).hexdigest()[:8],
        "{{build.fecha}}": ahora.strftime("%Y-%m-%d %H:%M"),
        "{{datos.tarifario}}": json_en_html(tarifario),
        "{{datos.forms}}": json_en_html(forms),
    }
    for page in sorted(SRC.glob("*.html")):
        html = page.read_text(encoding="utf-8")
        for k, v in reemplazos.items():
            html = html.replace(k, v)
        sueltos = re.findall(r"\{\{[^}]+\}\}", html)
        if sueltos:
            fail(f"{page.name}: placeholders sin resolver {sueltos}")
        if re.search(r'(href|src|action)="/(?!/)', html):
            fail(f"{page.name}: hay rutas absolutas que empiezan con '/' (Pages sirve en subruta)")
        (DOCS / page.name).write_text(html, encoding="utf-8")

    for css in (DOCS / "assets").rglob("*.css"):
        if re.search(r"url\(\s*['\"]?/(?!/)", css.read_text(encoding="utf-8")):
            fail(f"{css.name}: url() absoluta")

    # Config mínima para qa_web.py: marca y tokens del dossier, sin tracking (excepción documentada).
    QA_DIR.mkdir(exist_ok=True)
    qa_cfg = {
        "_generado_por": "tools/build.py — config derivada solo para qa_web.py",
        "marca": {"nombre": "Centro de Mando MMG", "url": PAGES_URL, "lang": "es"},
        "design": {k: marca["design"][k] for k in ("tokens", "wcag_min_ratio") if k in marca["design"]},
        "compliance": marca.get("compliance", {}),
        "tracking": {},
        "validacion": {"hipotesis_a_validar": [], "total_hipotesis": 0},
    }
    (QA_DIR / "site_config.qa.json").write_text(json.dumps(qa_cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    n_serv = len(tarifario["servicios"])
    print(f"OK build → {DOCS}")
    print(f"   tarifario {tarifario['_meta']['generado']} · {n_serv} servicios · "
          f"{len(casos['casos'])} casos de paridad · {len(forms['formularios'])} formularios")
    return 0


if __name__ == "__main__":
    sys.exit(main())
