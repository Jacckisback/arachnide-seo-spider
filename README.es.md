<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — rastreador SEO técnico gratuito y de código abierto de Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <b>🇪🇸 Español</b> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licencia MIT"></a>
  <img src="https://img.shields.io/badge/version-2.0.0-3d5f17" alt="Versión 2.0.0">
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
| **Imágenes** | Texto alternativo ausente, imágenes pesadas, imágenes rotas, width/height ausentes (CLS) |
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

## ⚙️ Opciones de rastreo

| Grupo | Opciones |
|---|---|
| Rastreo | Máximo de URLs, profundidad máxima, peticiones simultáneas, retraso entre peticiones, tiempo de espera |
| Renderizado | Renderizado JavaScript, user-agent (Arachnide, Googlebot escritorio/smartphone, Chrome), Accept-Language |
| Alcance | Incluir / excluir URLs con una regex, búsqueda personalizada, subdominios, ignorar parámetros de URL |
| Comprobaciones | Respetar robots.txt, leer sitemaps XML, seguir canonicals, comprobar enlaces externos, comprobar imágenes |

Usa el selector **Sitio / Lista** junto al campo de dirección para rastrear un sitio entero o solo una lista de URLs.

## 🖥️ Línea de comandos

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang es
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
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
  server.mjs     servidor web local y API con actualizaciones en directo
  cli.mjs        interfaz de línea de comandos
public/
  app.js         interfaz web (sin framework)
  i18n/*.js      traducciones (en, fr, de, es, it, pt)
  shared/        generador de informes, comparación de rastreos, i18n, iconos (usados por la UI y la CLI)
```

**Añadir un idioma:** copia `public/i18n/en.js`, traduce los valores y añade el idioma a `LANGS` en `public/shared/i18n.js`. `npm test` comprueba que no falte ninguna clave ni ningún marcador.

## 🗺️ Hoja de ruta

- [ ] Datos de campo de PageSpeed Insights / CrUX
- [ ] Integración con Google Search Console (clics e impresiones por URL)
- [ ] Extracción personalizada (selectores CSS / XPath)
- [ ] Rastreos programados con alertas por correo electrónico
- [ ] Visualización interactiva de la arquitectura del sitio

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
