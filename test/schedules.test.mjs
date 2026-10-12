// Crawls planifiés : calcul des échéances, règles d'alerte et envoi réel de l'e-mail à un faux serveur SMTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startFixture } from './fixture-site.mjs';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-sched-'));
process.env.ARACHNIDE_HOME = path.join(tmp, 'home');
process.env.ARACHNIDE_CRAWLS = path.join(tmp, 'crawls');
const { lastDue, nextRun, isDue, evaluateAlerts, saveSchedule, readSchedules, runSchedule, deleteSchedule } = await import('../src/schedules.mjs');

// Serveur SMTP minimal : enregistre les messages reçus.
function fakeSmtp() {
  const mails = [];
  const server = net.createServer((sock) => {
    let data = false;
    let buf = '';
    let mail = { rcpt: [], body: '' };
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') {
            data = false;
            mails.push(mail);
            mail = { rcpt: [], body: '' };
            sock.write('250 OK queued\r\n');
          } else mail.body += line + '\n';
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-fake\r\n250 8BITMIME\r\n');
        else if (cmd === 'RCPT') {
          mail.rcpt.push(/<(.+)>/.exec(line)[1]);
          sock.write('250 OK\r\n');
        } else if (cmd === 'DATA') {
          data = true;
          sock.write('354 go\r\n');
        } else if (cmd === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 OK\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, mails })));
}

test('échéances : quotidien, hebdomadaire, mensuel et rattrapage', () => {
  const now = new Date(2026, 9, 14, 10, 30); // mercredi 14 octobre 2026, 10:30
  assert.equal(lastDue({ frequency: 'daily', time: '06:00' }, now).getDate(), 14);
  assert.equal(lastDue({ frequency: 'daily', time: '11:00' }, now).getDate(), 13);
  assert.equal(lastDue({ frequency: 'weekly', time: '06:00', weekday: 1 }, now).getDate(), 12); // lundi
  assert.equal(lastDue({ frequency: 'weekly', time: '11:00', weekday: 3 }, now).getDate(), 7); // mercredi précédent
  assert.equal(lastDue({ frequency: 'monthly', time: '06:00', monthday: 20 }, now).getMonth(), 8);
  assert.equal(nextRun({ frequency: 'weekly', time: '06:00', weekday: 1 }, now).getDate(), 19);
  const s = { enabled: true, frequency: 'daily', time: '06:00', createdAt: new Date(2026, 9, 13, 12).toISOString(), lastRun: null };
  assert.equal(isDue(s, now), true);
  assert.equal(isDue({ ...s, lastRun: new Date(2026, 9, 14, 6, 1).toISOString() }, now), false);
  assert.equal(isDue({ ...s, enabled: false }, now), false);
  assert.equal(isDue({ ...s, createdAt: new Date(2026, 9, 14, 9).toISOString() }, now), false); // créé après l'échéance du jour
});

test('règles d’alerte : baisse du score, nouvelles erreurs, nouveaux problèmes', () => {
  const R = (score, issues) => ({ summary: { score }, issues: issues.map(([id, severity, count]) => ({ id, severity, count })), pages: [], meta: {} });
  const prev = R(80, [['4xx', 'error', 2], ['title-long', 'warning', 5]]);
  const cur = R(72, [['4xx', 'error', 6], ['5xx', 'error', 1], ['title-long', 'warning', 5], ['h2-missing', 'notice', 3]]);
  const { alerts } = evaluateAlerts(cur, prev, { scoreDrop: 5, errors: true, newIssues: true });
  assert.deepEqual(alerts.map((a) => a.key + ':' + (a.params.id || '')), ['alert.scoreDrop:', 'alert.errors:5xx', 'alert.errors:4xx', 'alert.newIssue:h2-missing']);
  assert.equal(evaluateAlerts(cur, prev, { scoreDrop: 10, errors: false, newIssues: false }).alerts.length, 0);
  assert.equal(evaluateAlerts(cur, null).alerts.length, 0);
});

test('crawl planifié de bout en bout : crawl, comparaison, e-mail avec rapport joint', async () => {
  const site = await startFixture();
  const smtp = await fakeSmtp();
  process.env.ARACHNIDE_SMTP_URL = `smtp://127.0.0.1:${smtp.server.address().port}`;
  process.env.ARACHNIDE_SMTP_FROM = 'arachnide@test.local';
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    const s = await saveSchedule({ url: base + '/', name: 'Site de test', frequency: 'daily', time: '06:00', emails: 'moi@exemple.fr, client@exemple.fr', lang: 'fr', alerts: { scoreDrop: 0, errors: true, always: true }, options: { maxPages: 30, concurrency: 3, httpPass: 'secret' } });
    assert.equal((await readSchedules()).length, 1);
    assert.equal(s.options.httpPass, undefined);
    const first = await runSchedule(s);
    assert.equal(first.status, 'ok', first.error);
    assert.equal(first.emailed, true, first.mailError);
    assert.equal(smtp.mails.length, 1);
    assert.deepEqual(smtp.mails[0].rcpt, ['moi@exemple.fr', 'client@exemple.fr']);
    assert.match(smtp.mails[0].body, /Subject: =\?UTF-8\?|Subject: \[Arachnide\]/);
    assert.match(smtp.mails[0].body, /_report\.html/);
    const second = await runSchedule((await readSchedules())[0]);
    assert.equal(second.status, 'ok');
    assert.equal(smtp.mails.length, 2);
    const saved = (await readSchedules())[0];
    assert.equal(saved.lastResult.status, 'ok');
    assert.ok(saved.lastRun);
    await deleteSchedule(saved.id);
    assert.equal((await readSchedules()).length, 0);
  } finally {
    delete process.env.ARACHNIDE_SMTP_URL;
    site.close();
    smtp.server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
