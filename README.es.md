<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — rastreador SEO técnico gratuito y de código abierto de Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <b>🇪🇸 Español</b> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licencia MIT"></a>
  <img src="https://img.shields.io/badge/version-3.3.0-3d5f17" alt="Versión 3.3.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 o posterior">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 idiomas">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** es un rastreador SEO técnico gratuito que funciona en tu propio ordenador, como Screaming Frog SEO Spider. Explora un sitio web como lo hace Googlebot, **renderiza JavaScript** si quieres y convierte el rastreo en una auditoría priorizada:

- una puntuación de salud sobre 100 y una puntuación por categoría;
- **unas 90 comprobaciones**, cada una con una explicación y una solución;
- un plan de acción ordenado por impacto y esfuerzo;
- un **informe PDF de marca blanca** para tus clientes, en 6 idiomas.

No hay cuenta, ni nube, ni límite de páginas, y tus datos se quedan en tu ordenador.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Panel: puntuación de salud SEO, puntuación por categoría, códigos de respuesta, profundidad de clics y prioridades" width="100%">
</p>

## 🛡️ Novedades de la 3.3: auditoría de fiabilidad

Una auditoría completa (extracción HTML, motor de rastreo, reglas SEO y rastreos de 8 sitios reales) eliminó los falsos positivos y falsos negativos que podían confundir a un profesional del SEO o del GEO.

- **Sitios protegidos contra robots** (403 al user-agent del rastreador): el rastreo cambia automáticamente a Chrome y lo indica, en lugar de mostrar todas las páginas con error.
- **Limitación de velocidad (429/503)**: Arachnide espera y reintenta; las páginas frenadas ya no se cuentan como rotas. Los enlaces a LinkedIn o a sitios protegidos por Cloudflare son «no comprobables», no «rotos».
- **Directivas leídas como Google**: `max-image-preview:none` no es un noindex, se ignora el `X-Robots-Tag` de otro robot, el meta refresh es una redirección.
- **El contenido tal como es**: `<title>` de los SVG ignorados, `alt=""` = imagen decorativa, imágenes en lazy-load (`data-src`) analizadas, recuento de palabras en chino, japonés y tailandés.
- **Internacional y datos estructurados**: hreflang comprobados con los códigos ISO reales, traducciones y páginas paginadas no son duplicados, solo se comprueban las propiedades schema.org que exige Google.
- **Una puntuación de salud más justa**: un enlace roto en el menú ya no deja el sitio en 0, y un sitio que bloquea a Googlebot ya no obtiene una A.
- **Nuevos controles**: soft 404, canonical fuera del `<head>`, sitemap en otro host, URL no comprobables.

## 📈 Novedades de la 3.2: datos de Google y rastreos programados

- **Core Web Vitals de usuarios reales** (PageSpeed Insights + CrUX: LCP, INP, CLS…) y puntuación Lighthouse de tus páginas clave.
- **Google Search Console**: clics, impresiones, CTR y posición por URL, por API o importando el CSV. También detecta **páginas que Google conoce pero que tus enlaces no alcanzan**, CTR bajos y páginas no indexables con tráfico.
- **Rastreos programados** (diarios / semanales / mensuales) con **alertas por email** cuando baja la puntuación o aparecen errores, con el informe completo adjunto.

Configuración en 5 minutos: **[docs/GOOGLE-AND-SCHEDULES.md](docs/GOOGLE-AND-SCHEDULES.md)** (en inglés).

## 🤖 Novedad en la 3.0: Claude audita **y corrige** tu web (MCP)

Arachnide incluye ahora un **servidor MCP**. Conéctalo a Claude (Claude Code o Claude Desktop) y pídeselo con tus propias palabras: *«Audita www.mi-web.es y corrige los títulos, las descripciones y los textos alternativos que faltan en las páginas más importantes.»* Claude se encargará de:

1. **detectar** el CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop, web estática, Next.js…);
2. **rastrear y auditar** la web con Arachnide;
3. **redactar** valores mejores a partir del contenido real de cada página (títulos únicos dentro del límite de píxeles de Google, descripciones, textos alternativos, canónicas, redirecciones para las URL rotas);
4. mostrarte una **vista previa del antes y el después** y esperar tu aprobación;
5. **aplicar** los cambios aprobados en la web en producción a través de la API del CMS, **verificarlos** y permitirte **deshacer** cualquier lote;
6. **volver a rastrear** y mostrarte la mejora de la puntuación.

| Cómo se aplican las correcciones | Plataformas | Cuota del total de webs* |
|---|---|---:|
| API del CMS (+ pequeño plugin de WordPress) | WordPress, Shopify, Wix, Joomla, Webflow, Drupal, PrestaShop | ≈ 53 % |
| Archivos HTML o Cloudflare Worker | webs sin CMS (a medida, estáticas, Next.js, Hugo…) y cualquier web detrás de Cloudflare | hasta un 31,6 % |
| Instrucciones paso a paso | Squarespace y otros constructores cerrados | el resto |

<sub>* W3Techs, octubre de 2026.</sub>

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

La seguridad, lo primero: vista previa antes de cada escritura, solicitud de permiso para cada escritura, reglas por web (campos permitidos, tamaño de los lotes, solo lectura), un registro de todos los valores anteriores con reversión en una sola llamada, y credenciales que nunca pasan por el chat. **Guía completa (en inglés): [docs/MCP.md](docs/MCP.md)**.

## 🆕 Novedades de la versión 2.1

| | |
|---|---|
| 🕸️ **Visualizaciones 2D y 3D** | Observa la arquitectura del sitio en 2D o en 3D, con tres vistas: **árbol de rastreo** (el camino de clics más corto desde la página de inicio), **árbol de directorios** (la estructura de las URLs) y **grafo de enlaces** (todos los enlaces internos seguidos). Colorea los nodos por indexabilidad, problemas SEO o profundidad; el tamaño del nodo indica el Link Score. Haz clic en un nodo para ver los detalles de la página y exporta la vista en PNG para tus informes. |
| ⚙️ **Configuración del rastreador, como en Screaming Frog** | Una ventana de **Configuración** con pestañas: Spider, **Límites**, **Velocidad**, **robots.txt**, Renderizado, Incluir / excluir, Extracción, Autenticación. Solo incluye los ajustes que importan. |
| 🚧 **Spider › Límites** | Total del rastreo, profundidad de rastreo, URLs por nivel de profundidad, profundidad de carpetas, número de parámetros de consulta, redirecciones que seguir, longitud de URL, enlaces por página, tamaño de página y **límites por ruta de URL** (`/blog/ = 200`). El panel muestra cuántas URLs ha omitido cada límite. |
| 🤖 **robots.txt** | Tres modos: **Respetar robots.txt**, **Ignorar robots.txt pero informar del estado** (rastrea las URLs bloqueadas y sigue marcándolas) e **Ignorar robots.txt**. Pega un **robots.txt personalizado** para probar un archivo nuevo antes de publicarlo y usa el **probador** integrado para ver si una URL está permitida y qué regla se aplica. |
| 🐢 **Velocidad** | Número máximo de hilos y un límite global de **URLs por segundo**, para proteger los servidores frágiles. |
| 🧲 **Extracción personalizada** | Recoge cualquier dato de cada página con un selector CSS o una regex: precio, autor, fecha, SKU, código de seguimiento… Aparece en una pestaña **Extracción** y en la exportación CSV. |
| 🔐 **Autenticación y limpieza de URLs** | Autenticación HTTP y cabeceras o cookies personalizadas para sitios de preproducción. Solo se envían al sitio auditado y la contraseña nunca se guarda. **Elimina parámetros de URL** como `utm_*`, `gclid` o `fbclid` para evitar URLs duplicadas. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Árbol de rastreo en 3D coloreado por problemas SEO" width="100%">
</p>

## ✨ Novedades de la 2.0

| | |
|---|---|
| 🌍 **6 idiomas** | La aplicación, las exportaciones CSV y los informes están disponibles en inglés, francés, alemán, español, italiano y portugués, con un selector de idioma en la cabecera. |
| ⚙️ **Renderizado JavaScript** | Audita sitios React, Vue, Angular y Next.js tal como los ve Google. Arachnide usa el Chrome o Edge que ya tienes instalado, así que no se descarga nada más. Compara el HTML original con la página renderizada y mide **LCP y CLS**. |
| 📄 **Informes SEO profesionales** | Un informe de auditoría de marca blanca con tu logotipo, tu color y tus datos de contacto. Incluye un resumen ejecutivo, los hallazgos clave, las puntuaciones por categoría, un plan de acción priorizado, un análisis detallado y la **evolución desde la última auditoría**. Imprímelo en PDF con un clic. [Ver un informe de ejemplo (PDF)](docs/sample-report.pdf). |
| 🎯 **Plan de acción** | Cada problema se ordena por gravedad × impacto × número de URLs ÷ esfuerzo, y se destacan las mejoras rápidas. |
| 🧠 **Nuevos análisis SEO** | PageRank interno (Link Score), contenido casi duplicado (simhash), canibalización de palabras clave, ancho de título y descripción en píxeles, enlaces contextuales frente a enlaces de menú y pie de página, anclas genéricas, jerarquía de encabezados, datos estructurados incompletos, validación de hreflang, compresión, HSTS y más. |
| 🤖 **IA y GEO** | Indica si ChatGPT, Claude, Perplexity, Google-Extended y otros rastreadores de IA pueden acceder al sitio, y si tiene un archivo `llms.txt`. |
| 📋 **Modo lista** | Audita solo una lista de URLs que pegas, sin seguir enlaces. |
| 🔎 **Búsqueda personalizada** | Encuentra todas las páginas que contienen un texto o una regex, como un número de teléfono antiguo o un código de seguimiento. |
| 🎨 **Nuevo diseño** | Pantalla de inicio con los rastreos recientes, progreso en directo con velocidad y tiempo restante, panel de detalle redimensionable, navegación con teclado (↑ ↓ Intro, `/` para buscar), notificaciones y modo oscuro. |

## 🔍 Todo lo que comprueba Arachnide

| Área | Comprobaciones |
|---|---|
| **Códigos de respuesta** | 2xx / 3xx / 4xx / 5xx, tiempos de espera agotados, URLs bloqueadas por robots.txt, enlaces internos y externos rotos |
| **Redirecciones** | Cadenas, bucles, redirecciones temporales 302/307, meta refresh, redirecciones a la página de inicio (soft 404), enlaces internos que apuntan a redirecciones |
| **Títulos y metas** | Ausentes, duplicados, demasiado largos (en píxeles), demasiado cortos o múltiples; título idéntico al H1; vista previa del SERP de Google |
| **Encabezados** | H1 ausente, duplicado o múltiple; sin H2; niveles de encabezado saltados |
| **Contenido** | Número de palabras, contenido escaso, duplicados exactos y casi duplicados, canibalización de palabras clave, palabra clave principal por página, ratio de texto |
| **Imágenes** | Texto alternativo ausente, imágenes pesadas, imágenes rotas, width/height ausentes (CLS), cada archivo de `srcset` y `<picture>` comprobado (peso, estado, formato), sin versión responsive, sin WebP / AVIF, `srcset` sin `sizes` |
| **Indexación** | Canonicals (ausentes, múltiples, que apuntan a una URL no indexable), noindex, nofollow, X-Robots-Tag |
| **Arquitectura** | Profundidad de clics, Link Score (PageRank interno), páginas huérfanas, páginas con un solo enlace entrante o sin enlace contextual, páginas inaccesibles |
| **Sitemaps** | Sitemap ausente, URLs no indexables en el sitemap, páginas indexables que faltan en el sitemap |
| **Internacional** | Códigos hreflang no válidos, enlaces de retorno ausentes, autorreferencia ausente, x-default ausente |
| **Datos estructurados** | Tipos detectados (JSON-LD, microdatos), JSON-LD no válido, propiedades que faltan para los resultados enriquecidos (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Contenido, enlaces, título, H1, canonical o noindex modificados por JavaScript; errores JS; LCP y CLS |
| **Rendimiento y seguridad** | Tiempo de respuesta, tamaño del HTML, compresión, HTTPS, HSTS, contenido mixto |
| **URLs** | Mayúsculas, guiones bajos, parámetros, acentos, longitud |
| **IA y GEO** | Acceso para Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…; llms.txt |

## 📸 Capturas de pantalla

| Problemas con soluciones | Plan de acción priorizado |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Lista de problemas con explicación, impacto, esfuerzo y solución"> | <img src="docs/screenshots/action-plan.png" alt="Plan de acción con mejoras rápidas"> |
| **Vista previa del SERP de Google (ancho en píxeles)** | **Enlazado interno, Link Score y enlaces entrantes** |
| <img src="docs/screenshots/titles-serp.png" alt="Pestaña de títulos con vista previa de Google y medidores en píxeles"> | <img src="docs/screenshots/internal-linking.png" alt="Pestaña de enlazado interno con Link Score y panel de enlaces entrantes"> |
| **Ajustes del informe de marca blanca** | **Informe de auditoría profesional** |
| <img src="docs/screenshots/report-dialog.png" alt="Diálogo del informe con logotipo, color, cliente y comparación"> | <img src="docs/screenshots/report.png" alt="Resumen ejecutivo del informe de auditoría"> |
| **Árbol de rastreo (2D)** | **Grafo de enlaces (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="Árbol de rastreo en 2D"> | <img src="docs/screenshots/viz-link-graph.png" alt="Grafo de enlaces internos dirigido por fuerzas"> |
| **Árbol de directorios** | **Extracción personalizada** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Visualización del árbol de directorios"> | <img src="docs/screenshots/custom-extraction.png" alt="Pestaña Extracción con precios extraídos mediante un selector CSS"> |
| **Configuración › Límites** | **Configuración › robots.txt (con probador)** |
| <img src="docs/screenshots/config-limits.png" alt="Ajustes de límites del spider"> | <img src="docs/screenshots/config-robots.png" alt="Modos de robots.txt, robots.txt personalizado y probador"> |
| **Pantalla de inicio** | **Modo oscuro** |
| <img src="docs/screenshots/home.png" alt="Pantalla de inicio con los rastreos recientes"> | <img src="docs/screenshots/dashboard-dark.png" alt="Panel en modo oscuro"> |

## 🚀 Instalación

### 1. Instala Node.js

Descarga la versión **LTS** desde **[nodejs.org](https://nodejs.org)** e instálala como cualquier otro programa. Necesitas la versión 18.17 o posterior; se recomienda la última LTS. Para comprobar tu versión, abre un terminal y escribe `node -v`.

Para el **Renderizado JavaScript**, también necesitas tener instalado Google Chrome, Microsoft Edge, Chromium o Brave. Arachnide encuentra el navegador automáticamente.

### 2. Descarga Arachnide

- **Lo más fácil:** haz clic en el botón verde **`<> Code`** en la parte superior de esta página, luego en **Download ZIP**, y descomprime el archivo.
- **Con Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Inícialo

**Opción A: doble clic.** El lanzador instala o actualiza todo y después abre tu navegador.

| Sistema | Archivo en el que hacer doble clic |
|---|---|
| macOS | `start-mac.command`. La primera vez, haz clic derecho sobre él y elige **Abrir**, porque macOS bloquea los scripts sin firmar. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Opción B: terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Después abre **http://localhost:4000**. Escribe la dirección de un sitio web y haz clic en **Rastrear**.

Deja abierta la ventana del terminal mientras usas la aplicación y pulsa `Ctrl + C` para detenerla. Si el puerto 4000 está ocupado, Arachnide elige el siguiente puerto libre y lo muestra en el terminal.

**Actualizar desde la 1.x:** descarga la nueva versión (o ejecuta `git pull`) y vuelve a ejecutar `npm install`. Los lanzadores de doble clic lo hacen por ti.

## 📄 Crear un informe para un cliente

1. Rastrea el sitio web.
2. Haz clic en **Informe**. Elige el idioma del informe y añade tu logotipo, el color de tu marca, el nombre del cliente y tus datos de contacto. Tus ajustes se guardan.
3. Si quieres, elige un **rastreo anterior del mismo sitio** para mostrar su evolución: cambio de puntuación, problemas resueltos y problemas nuevos.
4. Haz clic en **Generar informe** y después en **Imprimir / Guardar como PDF**.

Usa **Todos los problemas (CSV)** para dar a tu cliente o a tu desarrollador la lista completa de URLs que hay que corregir.

## ⚙️ Configuración

Haz clic en **⚙ Opciones** para abrir la ventana de **Configuración**. Tus ajustes se guardan, excepto la contraseña.

| Pestaña | Ajustes |
|---|---|
| Spider | Leer sitemaps XML, seguir canonicals, incluir subdominios, comprobar enlaces externos e imágenes |
| Límites | Total del rastreo, profundidad de rastreo, URLs por nivel de profundidad, profundidad de carpetas, parámetros de consulta, redirecciones que seguir, longitud de URL, enlaces por página, tamaño de página, límites por ruta de URL (`/blog/ = 200`, uno por línea) |
| Velocidad | Número máximo de hilos, máximo de URLs por segundo, tiempo de espera |
| robots.txt | Respetar / ignorar pero informar del estado / ignorar, robots.txt personalizado, probador de URLs |
| Renderizado | Renderizado JavaScript, user-agent (Arachnide, Googlebot escritorio/smartphone, Chrome), Accept-Language |
| Incluir / excluir | Regex para incluir / excluir, eliminar parámetros de URL (`utm_*, gclid`), ignorar todos los parámetros, búsqueda personalizada |
| Extracción | Hasta 20 extractores: selector CSS (texto, atributo, HTML o número) o regex |
| Autenticación | Usuario y contraseña HTTP, cabeceras personalizadas (cookies, tokens) |

Usa el selector **Sitio / Lista** junto al campo de dirección para rastrear un sitio entero o solo una lista de URLs.

## 🕸️ Visualizaciones

Abre **Visualizaciones** en la barra lateral después de un rastreo:

- **Árbol de rastreo:** cada página está unida a la página que llevó a ella en el nivel de clics anterior. Las ramas largas indican páginas profundas.
- **Directorios:** la estructura de las URLs, carpeta por carpeta. Pone de manifiesto las secciones desequilibradas o demasiado profundas.
- **Enlaces:** el grafo completo de enlaces internos. Las páginas bien enlazadas se agrupan en el centro y las páginas aisladas se alejan hacia el borde.

Cambia entre **2D** y **3D**, colorea por indexabilidad, problemas o profundidad, elige cuántos nodos mostrar (hasta 6000), haz clic en un nodo para abrir sus detalles y exporta un PNG para tus informes.

## 🖥️ Línea de comandos

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang es
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

La CLI muestra la puntuación y los problemas en tu idioma. Guarda el rastreo en JSON, que puedes abrir en la interfaz con **📂**. Con `--csv` también exporta las páginas y los problemas, y con `--report` genera un informe de auditoría HTML con tu marca que puedes imprimir en PDF.

## 🛠️ Solución de problemas

| Mensaje | Solución |
|---|---|
| `cd: no such file or directory` | No estás en la carpeta correcta. Usa `cd` seguido de la ruta de la carpeta descomprimida, por ejemplo `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | La misma causa: ejecuta `npm install` **dentro** de la carpeta de Arachnide. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Tu shell define una opción que tu versión de Node no admite. Ejecuta `unset NODE_OPTIONS` (macOS/Linux) o actualiza Node.js a la última LTS. |
| El renderizado JavaScript no está disponible | Instala Google Chrome. Si está instalado en una ubicación poco habitual, inicia Arachnide con `CHROME_PATH="/path/to/chrome" npm start`. |
| Algunas páginas no muestran H1 ni contenido | Probablemente el sitio genera su contenido con JavaScript. Activa el **Renderizado JavaScript** en las opciones. |

## 🧪 Desarrollo

```bash
npm test
```

Los tests rastrean un pequeño sitio web local con errores SEO intencionados (`test/fixture-site.mjs`). Cubren el renderizado JavaScript, el modo lista, los informes en todos los idiomas y la completitud de las traducciones. Se ejecutan en Node 18, 20 y 22 mediante GitHub Actions.

```
src/
  crawler.mjs    motor de rastreo (cola, concurrencia, robots.txt, sitemaps, redirecciones, modo lista)
  renderer.mjs   renderizado JavaScript con el Chrome / Edge instalado (puppeteer-core)
  parse.mjs      extracción del HTML (títulos, metas, encabezados, enlaces, imágenes, schema, hreflang…)
  analyze.mjs    grafo de enlaces, profundidad de clics, Link Score, duplicados, canibalización, comprobaciones SEO
  text.mjs       palabras clave, stop words multilingües, simhash
  pixel.mjs      ancho de título y descripción en píxeles
  options.mjs    validación de la configuración del rastreo (UI y CLI)
  server.mjs     servidor web local y API con actualizaciones en directo
  cli.mjs        interfaz de línea de comandos
public/
  app.js         interfaz web (sin framework)
  viz.js         visualizaciones 2D / 3D (force-graph, 3d-force-graph, servidos localmente)
  i18n/*.js      traducciones (en, fr, de, es, it, pt)
  shared/        generador de informes, comparación de rastreos, parser de robots.txt, i18n, iconos (usados por la UI y la CLI)
```

**Añadir un idioma:** copia `public/i18n/en.js`, traduce los valores y añade el idioma a `LANGS` en `public/shared/i18n.js`. `npm test` comprueba que no falte ninguna clave ni ningún marcador.

## 🗺️ Hoja de ruta

- [ ] Datos de campo de PageSpeed Insights / CrUX
- [ ] Integración con Google Search Console (clics e impresiones por URL)
- [ ] Rastreos programados con alertas por correo electrónico
- [ ] Importación de una exportación CSV de Google Search Console (páginas huérfanas que solo aparecen en GSC)
- [x] Extracción personalizada (2.1)
- [x] Visualizaciones 2D / 3D de la arquitectura del sitio (2.1)

Las sugerencias y las pull requests son bienvenidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Uso responsable

Rastrea solo sitios web que sean tuyos o que tengas permiso para auditar. En los sitios de clientes, mantén entre 2 y 5 peticiones simultáneas y añade una pausa en los alojamientos compartidos. La interfaz solo escucha en tu ordenador (`127.0.0.1`).

---

## 👤 Autor

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p><b>Consultor SEO</b> freelance y profesor de francés afincado en <b>Madrid</b> 🇪🇸🇫🇷.<br>
      Creé Arachnide para mis propias auditorías SEO técnicas y lo comparto libremente con la comunidad SEO.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — Auditorías y consultoría SEO<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — Cursos de francés y preparación DELF / DALF / TCF
      </p>
      <p><b>¿Necesitas una auditoría SEO completa o ayuda para corregir los problemas que ha encontrado Arachnide?</b> <a href="https://thierrygustin.com/contact">Contacta conmigo →</a></p>
    </td>
  </tr>
</table>

Si Arachnide te ahorra tiempo, ¡una ⭐ en GitHub ayuda mucho!

## 📄 Licencia

[MIT](LICENSE) © 2026 Thierry Gustin. Puedes usarlo, modificarlo y compartirlo libremente, también en trabajos comerciales.

<sub>Arachnide es un proyecto independiente, sin relación con Screaming Frog Ltd. “Screaming Frog” es una marca registrada de su propietario.</sub>
