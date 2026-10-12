# Contributing to Arachnide

Thanks for your interest! 🕷️ Bug reports, ideas and pull requests are welcome, in English, French, German or Spanish.

## Report a bug

Open an [issue](https://github.com/Jacckisback/arachnide-seo-spider/issues) and include:

- your operating system and Node.js version (`node -v`)
- the steps to reproduce the bug, and the URL you crawled if it is public
- the error shown in the terminal or the browser console

## Propose a change

1. Fork the repository and create a branch: `git checkout -b my-feature`
2. Install the dependencies: `npm install`
3. Make your change. Keep the code dependency-light: the interface is plain HTML/CSS/JS with no framework.
4. Add or update a test in `test/` if you change the crawler or the SEO checks.
5. Run `npm test` and check that everything passes.
6. Open a pull request that explains what it changes and why.

## Add a new SEO check

SEO checks live in `src/analyze.mjs`. Each check is one `add(id, severity, category, impact, effort, items, params)` call:

- `severity` is `error`, `warning` or `notice`
- `impact` and `effort` are `high`, `medium` or `low`; they drive the action plan
- `items` is a list of `{ url, detail }` objects; `detail` is plain text or a translation key `D('d.key', { params })`

Then add `issue.<id>.label`, `issue.<id>.desc` and `issue.<id>.fix` to **every** file in `public/i18n/` and run `npm test`: it fails if a key or a placeholder is missing in any language.

The check then appears automatically in the dashboard, the issues tab, the action plan, the exports and the reports.

## Translations

Translations live in `public/i18n/<code>.js` (flat `key → text` objects, `{placeholders}` must be kept). Corrections from native speakers are very welcome.
