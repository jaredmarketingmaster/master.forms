# Acceso privado · opciones reales (investigado el 2026-11-17)

## Hoy

- El sitio de Pages es público para cualquiera que tenga la URL. `noindex` evita que aparezca en buscadores, pero no impide entrar.
- **El repo también es público:** cualquiera puede ver `docs/data/tarifario_v1.json` (precios y notas internas) y `casos_paridad.json`. Restringir solo el sitio no alcanza si el repo sigue público.

## Opciones

| Opción | Qué protege | Costo | Notas |
| :--- | :--- | :--- | :--- |
| **A. Cloudflare Pages + Cloudflare Access** (recomendada) | El sitio, con login real (código por email o Google) para los emails autorizados. El repo pasa a privado. | Plan gratuito de Zero Trust (hasta 50 usuarios, según Cloudflare). | Cloudflare Pages se conecta al mismo repo y rama `main`, con salida `docs`. Después se apaga GitHub Pages y el repo pasa a privado. Requiere cuenta de Cloudflare. |
| B. GitHub Pages privado | Solo quienes tengan acceso de lectura al repo. | GitHub Enterprise Cloud (organización). | Es la única forma de restringir Pages en GitHub. En los planes personales, un Pages hecho desde un repo privado sigue siendo público. |
| C. Repo privado + Pages público | Oculta el código y los JSON del repo, pero el sitio sigue público y sirve igual `docs/data/`. | GitHub Pro. | Solo es oscuridad. No es control de acceso. |
| D. Contraseña en JavaScript | Nada: los datos viajan igual al navegador. | — | Un obstáculo, no seguridad. No se implementa. |

## Más adelante, en GoHighLevel AI Studio

No encontré una protección por contraseña o login nativa y confirmada para páginas publicadas de AI Studio:

- Una guía vieja de GHL dice que las páginas de funnels son públicas y propone un PIN en JavaScript (obstáculo, no seguridad).
- En el tablero de ideas de GHL hay pedidos abiertos de "página privada / solo interna".
- AI Studio sí permite apps con registro e ingreso de usuarios sobre su base de datos en la nube. Si eso existe en tu cuenta, sería el camino real: login del lado del servidor, no en el navegador.

**A verificar dentro de tu cuenta de GHL antes de migrar.**

## Fuentes

- [GitHub Docs · About privately published GitHub Pages sites](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/about-privately-published-github-pages-sites)
- [GitHub Changelog · Access control for GitHub Pages (2021)](https://github.blog/changelog/2021-01-21-access-control-for-github-pages)
- [Cloudflare Access](https://www.cloudflare.com/en-au/products/cloudflare-access)
- [GHL Experts · PIN en páginas de funnels](https://www.ghlexperts.com/guides/how-to-password-protect-a-gohighlevel-funnel-page-with-a-pin-code)
- [GHL Ideas · AI Studio Page privacy control](https://ideas.gohighlevel.com/ai-studio/p/ai-studio-page-privacy-control-public-internal-only)
- [GHL Ideas · Private page access with user login](https://ideas.gohighlevel.com/website/p/admin-controlled-private-page-access-with-user-login-for-website-pages)
