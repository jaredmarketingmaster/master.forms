"""Gate de publicación del Centro de Mando MMG.

build → paridad del motor (Node) → paridad de la interfaz (Playwright, 390 y 1440) → qa_web.py.
Exit 0 solo si todo pasa. Los hallazgos de qa_web.py que vienen de las excepciones de
herramienta interna (sin tracking) se aceptan y se listan; cualquier otro ERROR bloquea.

Uso:  python tools/verificar.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PROJ = Path(__file__).resolve().parents[1]
MODULE = PROJ.parents[1]
REPORTES = PROJ / "qa_reports"

# Excepciones documentadas (README §Excepciones): herramienta interna sin tracking ni DTR.
EXCEPCIONES = {
    "gtm": "Sin GTM ni tags de medición: herramienta interna, no se mide.",
    "id:gtm": "Sin contenedor GTM: no aplica.",
    "datalayer": "Sin window.dataLayer: no hay tracking.",
    "dtr_js": "Sin dtr_and_tracking.js: no hay UTMs ni DTR en una app interna.",
    "dtr_h1": "H1 sin data-dtr: no hay DTR.",
    "cta": "Sin data-cta: no hay evento cta_click.",
    "id:ga4": "Sin GA4: no aplica.",
    "id:meta_pixel": "Sin Meta Pixel: no aplica.",
    "id:clarity": "Sin Clarity: no aplica.",
    "id:ghl": "Sin GHL todavía: va a AI Studio más adelante.",
    "id:whatsapp": "Sin WhatsApp: no es una landing.",
    "contenido": "Pocas palabras visibles: es una pantalla de app, no una página de lectura.",
}
# Advertencia de margen WCAG del azul de marca (4,51:1): aceptada con texto ≥ 16 px / 700 en botones.
WCAG_MARGEN = "pasa por margen mínimo"


def correr(nombre: str, cmd: list[str], cwd: Path) -> int:
    print(f"\n=== {nombre} ===", flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    print(f"--- {nombre}: exit {r.returncode}", flush=True)
    return r.returncode


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    REPORTES.mkdir(exist_ok=True)
    res = {}
    res["build"] = correr("Build", [sys.executable, "tools/build.py"], PROJ)
    if res["build"]:
        return 1
    res["paridad_motor"] = correr("Paridad del motor", ["node", "tools/test_paridad.js", "--json", str(REPORTES / "paridad_motor.json")], PROJ)
    res["paridad_ui"] = correr("Paridad de la interfaz", ["node", "tools/test_ui.js", "--json", str(REPORTES / "paridad_ui.json"),
                                                          "--capturas", str(REPORTES / "capturas")], PROJ)
    antes = set(REPORTES.glob("qa_*.json"))
    correr("QA qa_web.py", [sys.executable, "_engine/qa_web.py", "mmg_centro_de_mando",
                            "--dist", str(PROJ / "docs"), "--config", str(PROJ / ".qa" / "site_config.qa.json")], MODULE)
    nuevos = sorted(set(REPORTES.glob("qa_*.json")) - antes)
    if not nuevos:
        print("ERROR: qa_web.py no dejó reporte")
        return 1
    qa = json.loads(nuevos[-1].read_text(encoding="utf-8"))
    hallazgos = [dict(f, pagina="global") for f in qa["global"]]
    for p in qa["paginas"]:
        hallazgos += [dict(f, pagina=p["archivo"]) for f in p["hallazgos"]]
    bloqueantes, aceptados = [], []
    for f in hallazgos:
        if f["nivel"] not in ("ERROR", "WARN"):
            continue
        if f["check"] in EXCEPCIONES or (f["check"] == "wcag" and WCAG_MARGEN in f["detalle"]):
            aceptados.append(f)
        else:
            bloqueantes.append(f)
    errores_qa = [f for f in bloqueantes if f["nivel"] == "ERROR"]
    print("\n=== Resumen ===")
    print(f"Build: OK · Paridad motor: {'PASA' if not res['paridad_motor'] else 'NO PASA'} · "
          f"Paridad interfaz: {'PASA' if not res['paridad_ui'] else 'NO PASA'}")
    print(f"QA: {qa['totales']['ERROR']} errores y {qa['totales']['WARN']} advertencias de qa_web.py · "
          f"{len(aceptados)} por excepciones documentadas · {len(errores_qa)} errores bloqueantes · "
          f"{len(bloqueantes) - len(errores_qa)} advertencias a revisar")
    for f in bloqueantes:
        print(f"  [{f['nivel']}] {f['pagina']} · {f['check']}: {f['detalle']}")
    print(f"Reporte QA: {nuevos[-1].with_suffix('.md')}")
    ok = not res["paridad_motor"] and not res["paridad_ui"] and not errores_qa and len(bloqueantes) == 0
    print("VEREDICTO: " + ("APTO PARA PUSH" if ok else "NO PUBLICAR"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
