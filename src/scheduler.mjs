#!/usr/bin/env node
// Planificateur seul (sans interface) : à lancer au démarrage de la machine (launchd, systemd, pm2, tâche Windows)
// pour que les crawls planifiés tournent même quand l'application n'est pas ouverte.  npm run scheduler
import { readSchedules, nextRun, startScheduler } from './schedules.mjs';
import { VERSION } from './crawler.mjs';

const list = await readSchedules();
console.log(`Arachnide SEO Spider ${VERSION} — scheduler: ${list.filter((s) => s.enabled).length} active schedule(s)`);
for (const s of list.filter((x) => x.enabled)) console.log(`  · ${s.name} (${s.frequency} ${s.time}) → next ${nextRun(s).toLocaleString()}`);
startScheduler({ interval: 60000 }).tick;
setInterval(() => {}, 1 << 30); // garde le processus actif
