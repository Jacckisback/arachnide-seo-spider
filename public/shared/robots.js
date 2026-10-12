// Parseur robots.txt (règles Google : groupe le plus spécifique, règle la plus longue gagne, * et $).

export function parseRobots(txt) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (let raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') sitemaps.push(val);
    else if ((key === 'allow' || key === 'disallow') && cur) {
      if (key === 'disallow' && !val) continue;
      cur.rules.push({ allow: key === 'allow', path: val, re: patternToRegex(val) });
    }
  }
  return { groups, sitemaps };
}

function patternToRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

// Renvoie les règles applicables à un user-agent donné.
export function rulesFor(robots, userAgent) {
  if (!robots) return [];
  const ua = String(userAgent || '').toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const g of robots.groups) {
    for (const a of g.agents) {
      if (a !== '*' && ua.includes(a) && a.length > bestLen) {
        best = a;
        bestLen = a.length;
      }
    }
  }
  const target = best || '*';
  return robots.groups.filter((g) => g.agents.includes(target)).flatMap((g) => g.rules);
}

// Règle qui s'applique à un chemin (la plus longue ; à égalité, Allow l'emporte), ou null.
export function matchRule(rules, pathAndQuery) {
  let match = null;
  for (const r of rules) {
    if (!r.re.test(pathAndQuery)) continue;
    if (!match || r.path.length > match.path.length || (r.path.length === match.path.length && r.allow)) {
      match = r;
    }
  }
  return match;
}

export function isAllowed(rules, pathAndQuery) {
  const match = matchRule(rules, pathAndQuery);
  return !match || match.allow;
}

// Teste une URL contre un robots.txt pour un user-agent (utilisé par le testeur de l'interface).
export function testRobots(txt, userAgent, url) {
  const robots = parseRobots(txt);
  const u = new URL(url);
  const rule = matchRule(rulesFor(robots, userAgent), u.pathname + u.search);
  return { allowed: !rule || rule.allow, rule: rule ? `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.path}` : null };
}
