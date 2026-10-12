<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — crawler de SEO técnico gratuito e de código aberto, criado por Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <b>🇵🇹 Português</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licença MIT"></a>
  <img src="https://img.shields.io/badge/version-2.1.0-3d5f17" alt="Versão 2.1.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 ou mais recente">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 idiomas">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Testes"></a>
</p>

---

O **Arachnide** é um crawler de SEO técnico gratuito que funciona no seu próprio computador, tal como o Screaming Frog SEO Spider. Explora um site da mesma forma que o Googlebot, **renderiza JavaScript** se quiser e transforma o rastreamento numa auditoria com prioridades:

- uma pontuação de saúde em 100 e uma pontuação para cada categoria;
- **cerca de 90 verificações**, cada uma com uma explicação e uma correção;
- um plano de ação ordenado por impacto e esforço;
- um **relatório PDF em marca branca** para os seus clientes, em 6 idiomas.

Não há conta, nem nuvem, nem limite de páginas, e os seus dados ficam no seu computador.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Painel: pontuação de saúde SEO, pontuação por categoria, códigos de resposta, profundidade de clique e prioridades" width="100%">
</p>

## 🆕 Novidades da versão 2.1

| | |
|---|---|
| 🕸️ **Visualizações 2D e 3D** | Veja a arquitetura do site em 2D ou 3D, em três vistas: **árvore de rastreio** (caminho de cliques mais curto a partir da página inicial), **diretórios** (estrutura dos URLs) e **links** (todos os links internos seguidos). Colore os nós por indexabilidade, problemas SEO ou profundidade; o tamanho do nó mostra o Link Score. Clique num nó para ver os detalhes da página e exporte a vista em PNG para os seus relatórios. |
| ⚙️ **Configuração do crawler, como no Screaming Frog** | Uma janela de **Configuração** com separadores: Spider, **Limites**, **Velocidade**, **robots.txt**, Renderização, Incluir / excluir, Extração, Autenticação. Mantém apenas as definições que importam. |
| 🚧 **Spider › Limites** | Total de rastreio, profundidade de rastreio, URLs por profundidade, profundidade de pastas, número de parâmetros de consulta, redirecionamentos a seguir, comprimento do URL, links por página, tamanho da página e **limites por caminho de URL** (`/blog/ = 200`). O painel mostra quantos URLs cada limite deixou de fora. |
| 🤖 **robots.txt** | Três modos: **respeitar**, **ignorar mas assinalar** (rastreia os URLs bloqueados e continua a assinalá-los) e **ignorar**. Cole um **robots.txt personalizado** para testar um novo ficheiro antes de o publicar e use o **testador** integrado para ver se um URL é permitido e que regra se aplica. |
| 🐢 **Velocidade** | Número máximo de threads e um limite global de **URLs por segundo**, para proteger servidores frágeis. |
| 🧲 **Extração personalizada** | Recolha quaisquer dados de cada página com um seletor CSS ou uma regex: preço, autor, data, SKU, código de acompanhamento… Os resultados aparecem num separador **Extração** e na exportação CSV. |
| 🔐 **Autenticação e limpeza de URLs** | Autenticação HTTP e cabeçalhos ou cookies personalizados para sites de pré-produção. Só são enviados para o site auditado e a palavra-passe nunca é guardada. **Remova parâmetros de URL** como `utm_*`, `gclid` ou `fbclid` para evitar URLs duplicados. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Árvore de rastreio em 3D colorida por problemas SEO" width="100%">
</p>

## ✨ Novidades da versão 2.0

| | |
|---|---|
| 🌍 **6 idiomas** | A aplicação, as exportações CSV e os relatórios estão disponíveis em inglês, francês, alemão, espanhol, italiano e português, com um seletor de idioma no cabeçalho. |
| ⚙️ **Renderização JavaScript** | Audita sites em React, Vue, Angular e Next.js tal como o Google os vê. O Arachnide usa o Chrome ou o Edge já instalado no seu computador, por isso não é transferido mais nada. Compara o HTML bruto com a página renderizada e mede o **LCP e o CLS**. |
| 📄 **Relatórios SEO profissionais** | Um relatório de auditoria em marca branca com o seu logótipo, a sua cor e os seus contactos. Contém um resumo executivo, as principais conclusões, pontuações por categoria, um plano de ação com prioridades, uma análise detalhada e a **evolução desde a última auditoria**. Imprima-o em PDF com um clique. [Ver um exemplo de relatório (PDF)](docs/sample-report.pdf). |
| 🎯 **Plano de ação** | Cada problema é ordenado por gravidade × impacto × número de URLs ÷ esforço, e as vitórias rápidas são destacadas. |
| 🧠 **Novas análises SEO** | PageRank interno (Link Score), conteúdo quase duplicado (simhash), canibalização de palavras-chave, largura do título e da descrição em píxeis, links contextuais vs links de menu e rodapé, âncoras genéricas, hierarquia de cabeçalhos, dados estruturados incompletos, validação hreflang, compressão, HSTS e muito mais. |
| 🤖 **IA e GEO** | Mostra se o ChatGPT, o Claude, o Perplexity, o Google-Extended e outros crawlers de IA conseguem aceder ao site, e se este tem um ficheiro `llms.txt`. |
| 📋 **Modo lista** | Audite apenas uma lista de URLs que colar, sem seguir links. |
| 🔎 **Pesquisa personalizada** | Encontre todas as páginas que contêm um texto ou uma regex, como um número de telefone antigo ou um código de tracking. |
| 🎨 **Novo design** | Ecrã inicial com os rastreamentos recentes, progresso em direto com velocidade e tempo restante, painel de detalhe redimensionável, navegação por teclado (↑ ↓ Enter, `/` para pesquisar), notificações e modo escuro. |

## 🔍 Tudo o que o Arachnide verifica

| Área | Verificações |
|---|---|
| **Códigos de resposta** | 2xx / 3xx / 4xx / 5xx, tempos limite esgotados, URLs bloqueados pelo robots.txt, links internos e externos partidos |
| **Redirecionamentos** | Cadeias, ciclos, redirecionamentos temporários 302/307, meta refresh, redirecionamentos para a página inicial (soft 404), links internos que apontam para redirecionamentos |
| **Títulos e metas** | Em falta, duplicados, demasiado longos (em píxeis), demasiado curtos ou múltiplos; título idêntico ao H1; pré-visualização da SERP do Google |
| **Cabeçalhos** | H1 em falta, duplicado ou múltiplo; sem H2; níveis de cabeçalho saltados |
| **Conteúdo** | Número de palavras, conteúdo pobre, duplicados exatos e quase duplicados, canibalização de palavras-chave, palavra-chave principal por página, rácio de texto |
| **Imagens** | Texto alternativo em falta, imagens pesadas, imagens partidas, width/height em falta (CLS), cada ficheiro de `srcset` e `<picture>` verificado (peso, estado, formato), sem versão responsiva, sem WebP / AVIF, `srcset` sem `sizes` |
| **Indexação** | Canónicos (em falta, múltiplos, a apontar para um URL não indexável), noindex, nofollow, X-Robots-Tag |
| **Arquitetura** | Profundidade de clique, Link Score (PageRank interno), páginas órfãs, páginas com um único link de entrada ou sem link contextual, páginas inacessíveis |
| **Sitemaps** | Sitemap em falta, URLs não indexáveis no sitemap, páginas indexáveis ausentes do sitemap |
| **Internacional** | Códigos hreflang inválidos, links de retorno em falta, autorreferência em falta, x-default em falta |
| **Dados estruturados** | Tipos encontrados (JSON-LD, microdados), JSON-LD inválido, propriedades em falta para resultados enriquecidos (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Conteúdo, links, título, H1, canónico ou noindex alterados pelo JavaScript; erros JS; LCP e CLS |
| **Desempenho e segurança** | Tempo de resposta, tamanho do HTML, compressão, HTTPS, HSTS, conteúdo misto |
| **URLs** | Letras maiúsculas, underscores, parâmetros, acentos, comprimento |
| **IA e GEO** | Acesso para Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…; llms.txt |

## 📸 Capturas de ecrã

| Problemas com correções | Plano de ação com prioridades |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Lista de problemas com explicação, impacto, esforço e correção"> | <img src="docs/screenshots/action-plan.png" alt="Plano de ação com vitórias rápidas"> |
| **Pré-visualização da SERP do Google (largura em píxeis)** | **Links internos, Link Score e links de entrada** |
| <img src="docs/screenshots/titles-serp.png" alt="Separador Títulos com pré-visualização do Google e medidores em píxeis"> | <img src="docs/screenshots/internal-linking.png" alt="Separador de links internos com Link Score e painel de links de entrada"> |
| **Definições do relatório em marca branca** | **Relatório de auditoria profissional** |
| <img src="docs/screenshots/report-dialog.png" alt="Janela do relatório com logótipo, cor, cliente e comparação"> | <img src="docs/screenshots/report.png" alt="Resumo executivo do relatório de auditoria"> |
| **Árvore de rastreio (2D)** | **Grafo de links (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="Árvore de rastreio em 2D"> | <img src="docs/screenshots/viz-link-graph.png" alt="Grafo de links internos com disposição por forças"> |
| **Diretórios** | **Extração personalizada** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Visualização dos diretórios"> | <img src="docs/screenshots/custom-extraction.png" alt="Separador Extração com preços extraídos por seletor CSS"> |
| **Configuração › Limites** | **Configuração › robots.txt (com testador)** |
| <img src="docs/screenshots/config-limits.png" alt="Definições de limites do spider"> | <img src="docs/screenshots/config-robots.png" alt="Modos do robots.txt, robots.txt personalizado e testador"> |
| **Ecrã inicial** | **Modo escuro** |
| <img src="docs/screenshots/home.png" alt="Ecrã inicial com os rastreamentos recentes"> | <img src="docs/screenshots/dashboard-dark.png" alt="Painel em modo escuro"> |

## 🚀 Instalação

### 1. Instalar o Node.js

Transfira a versão **LTS** em **[nodejs.org](https://nodejs.org)** e instale-a como qualquer outro programa. Precisa da versão 18.17 ou mais recente; recomenda-se a LTS mais recente. Para verificar a sua versão, abra um terminal e escreva `node -v`.

Para a **Renderização JavaScript**, precisa também de ter instalado o Google Chrome, o Microsoft Edge, o Chromium ou o Brave. O Arachnide encontra o navegador automaticamente.

### 2. Transferir o Arachnide

- **A forma mais simples:** clique no botão verde **`<> Code`** no topo desta página, depois em **Download ZIP**, e descomprima o ficheiro.
- **Com Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Iniciar

**Opção A: duplo clique.** O lançador instala ou atualiza tudo e depois abre o seu navegador.

| Sistema | Ficheiro para fazer duplo clique |
|---|---|
| macOS | `start-mac.command`. Na primeira vez, clique com o botão direito e escolha **Abrir**, porque o macOS bloqueia scripts não assinados. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Opção B: terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Depois abra **http://localhost:4000**. Escreva o endereço de um site e clique em **Rastrear**.

Mantenha a janela do terminal aberta enquanto usa a aplicação e prima `Ctrl + C` para a parar. Se a porta 4000 estiver ocupada, o Arachnide escolhe a próxima porta livre e mostra-a no terminal.

**Atualizar a partir da 1.x:** transfira a nova versão (ou execute `git pull`) e depois execute novamente `npm install`. Os lançadores de duplo clique fazem isto por si.

## 📄 Criar um relatório para um cliente

1. Rastreie o site.
2. Clique em **Relatório**. Escolha o idioma do relatório e depois adicione o seu logótipo, a cor da sua marca, o nome do cliente e os seus contactos. As suas definições ficam guardadas.
3. Opcionalmente, escolha um **rastreamento anterior do mesmo site** para mostrar a evolução: variação da pontuação, problemas corrigidos e novos problemas.
4. Clique em **Gerar relatório** e depois em **Imprimir / Guardar como PDF**.

Use **Todos os problemas (CSV)** para dar ao seu cliente ou programador a lista completa de URLs a corrigir.

## ⚙️ Configuração

Clique em **⚙ Opções** para abrir a janela **Configuração**. As suas definições ficam guardadas, exceto a palavra-passe.

| Separador | Definições |
|---|---|
| Spider | Ler sitemaps XML, seguir canónicos, incluir subdomínios, verificar links externos e imagens |
| Limites | Total de rastreio, profundidade de rastreio, URLs por profundidade, profundidade de pastas, parâmetros de consulta, redirecionamentos a seguir, comprimento do URL, links por página, tamanho da página, limites por caminho de URL (`/blog/ = 200`, um por linha) |
| Velocidade | Número máximo de threads, máximo de URLs por segundo, tempo limite |
| robots.txt | Respeitar robots.txt / Ignorar robots.txt mas assinalar o estado / Ignorar robots.txt, robots.txt personalizado, testador de URLs |
| Renderização | Renderização JavaScript, user-agent (Arachnide, Googlebot desktop/smartphone, Chrome), Accept-Language |
| Incluir / excluir | Regex de inclusão / exclusão, remover parâmetros de URL (`utm_*, gclid`), ignorar todos os parâmetros, pesquisa personalizada |
| Extração | Até 20 extratores: seletor CSS (texto, atributo, HTML ou contagem) ou regex |
| Autenticação | Utilizador e palavra-passe HTTP, cabeçalhos personalizados (cookies, tokens) |

Use o seletor **Site / Lista** junto ao campo de endereço para rastrear um site inteiro ou apenas uma lista de URLs.

## 🕸️ Visualizações

Depois de um rastreio, abra **Visualizações** na barra lateral:

- **Árvore de rastreio:** cada página está ligada à página que levou até ela no nível de profundidade de clique anterior. Ramos longos significam páginas profundas.
- **Diretórios:** a estrutura dos URLs, pasta a pasta. Mostra secções desequilibradas ou demasiado profundas.
- **Links:** o grafo completo dos links internos. As páginas bem ligadas agrupam-se no centro e as páginas isoladas afastam-se para a periferia.

Alterne entre **2D** e **3D**, colore por indexabilidade, problemas ou profundidade, escolha quantos nós mostrar (até 6000), clique num nó para abrir os seus detalhes e exporte um PNG para os seus relatórios.

## 🖥️ Linha de comandos

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang pt
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

A CLI mostra a pontuação e os problemas no seu idioma. Guarda o rastreamento em JSON, que pode abrir na interface com **📂**. Com `--csv` exporta também as páginas e os problemas, e com `--report` gera um relatório de auditoria HTML com a sua marca, que pode imprimir em PDF.

## 🛠️ Resolução de problemas

| Mensagem | Solução |
|---|---|
| `cd: no such file or directory` | Não está na pasta certa. Use `cd` seguido do caminho da pasta descomprimida, por exemplo `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Mesma causa: execute `npm install` **dentro** da pasta do Arachnide. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | A sua shell define uma opção que a sua versão do Node não suporta. Execute `unset NODE_OPTIONS` (macOS/Linux) ou atualize o Node.js para a LTS mais recente. |
| A renderização JavaScript não está disponível | Instale o Google Chrome. Se estiver instalado num local pouco habitual, inicie o Arachnide com `CHROME_PATH="/path/to/chrome" npm start`. |
| Algumas páginas não mostram H1 nem conteúdo | O site provavelmente constrói o conteúdo com JavaScript. Ative a **Renderização JavaScript** nas opções. |

## 🧪 Desenvolvimento

```bash
npm test
```

Os testes rastreiam um pequeno site local com erros de SEO intencionais (`test/fixture-site.mjs`). Abrangem a renderização JavaScript, o modo lista, os relatórios em todos os idiomas e a completude das traduções. São executados no Node 18, 20 e 22 através do GitHub Actions.

```
src/
  crawler.mjs    crawl engine (queue, concurrency, robots.txt, sitemaps, redirects, list mode)
  renderer.mjs   JavaScript rendering with the installed Chrome / Edge (puppeteer-core)
  parse.mjs      HTML extraction (titles, metas, headings, links, images, schema, hreflang…)
  analyze.mjs    link graph, click depth, Link Score, duplicates, cannibalisation, SEO checks
  text.mjs       keywords, multilingual stop words, simhash
  pixel.mjs      title and description width in pixels
  options.mjs    validation of the crawl configuration (UI and CLI)
  server.mjs     local web server and API with live updates
  cli.mjs        command-line interface
public/
  app.js         web interface (no framework)
  viz.js         2D / 3D visualisations (force-graph, 3d-force-graph, served locally)
  i18n/*.js      translations (en, fr, de, es, it, pt)
  shared/        report generator, crawl comparison, robots.txt parser, i18n, icons (used by the UI and the CLI)
```

**Adicionar um idioma:** copie `public/i18n/en.js`, traduza os valores e adicione o idioma a `LANGS` em `public/shared/i18n.js`. O `npm test` verifica que não falta nenhuma chave nem nenhum marcador.

## 🗺️ Roteiro

- [ ] Dados de campo do PageSpeed Insights / CrUX
- [ ] Integração com o Google Search Console (cliques e impressões por URL)
- [ ] Rastreamentos agendados com alertas por e-mail
- [ ] Importação de uma exportação CSV do Google Search Console (páginas órfãs presentes apenas no GSC)
- [x] Extração personalizada (2.1)
- [x] Visualizações 2D / 3D da arquitetura do site (2.1)

Sugestões e pull requests são bem-vindos. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Utilização responsável

Rastreie apenas sites que lhe pertencem ou que está autorizado a auditar. Em sites de clientes, mantenha 2 a 5 pedidos simultâneos e adicione uma pausa em alojamento partilhado. A interface só escuta no seu computador (`127.0.0.1`).

---

## 👤 Autor

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p><b>Consultor SEO</b> freelancer e professor de francês, a viver em <b>Madrid</b> 🇪🇸🇫🇷.<br>
      Criei o Arachnide para as minhas próprias auditorias de SEO técnico e partilho-o gratuitamente com a comunidade SEO.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — auditorias e consultoria SEO<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — cursos de francês e preparação para DELF / DALF / TCF
      </p>
      <p><b>Precisa de uma auditoria SEO completa ou de ajuda para corrigir os problemas que o Arachnide encontrou?</b> <a href="https://thierrygustin.com/contact">Entre em contacto →</a></p>
    </td>
  </tr>
</table>

Se o Arachnide lhe poupa tempo, uma ⭐ no GitHub ajuda muito!

## 📄 Licença

[MIT](LICENSE) © 2026 Thierry Gustin. Pode usá-lo, modificá-lo e partilhá-lo livremente, incluindo em trabalho comercial.

<sub>O Arachnide é um projeto independente, sem qualquer ligação à Screaming Frog Ltd. “Screaming Frog” é uma marca registada do respetivo proprietário.</sub>
