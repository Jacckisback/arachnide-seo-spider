// Envoi des alertes par e-mail (SMTP). Réglages dans ~/.arachnide/smtp.json, ou ARACHNIDE_SMTP_URL
// (smtp://utilisateur:motdepasse@serveur:587). Le mot de passe n'est jamais renvoyé à l'interface.
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { CONFIG_DIR } from './sites.mjs';

const SMTP_FILE = path.join(CONFIG_DIR, 'smtp.json');

export async function readSmtp() {
  try {
    return JSON.parse(await fs.readFile(SMTP_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Réglages affichables : le mot de passe est remplacé par un indicateur.
export async function publicSmtp() {
  const s = await readSmtp();
  return { host: s.host || '', port: s.port || 587, secure: !!s.secure, user: s.user || '', from: s.from || '', hasPassword: !!s.pass, fromEnv: !!process.env.ARACHNIDE_SMTP_URL };
}

export async function saveSmtp(input) {
  const prev = await readSmtp();
  const next = {
    host: String(input.host || '').trim(),
    port: Number(input.port) || 587,
    secure: !!input.secure,
    user: String(input.user || '').trim(),
    from: String(input.from || '').trim(),
    // Mot de passe : conservé s'il n'est pas ressaisi, effacé avec une chaîne vide explicite.
    pass: input.pass === undefined || input.pass === null ? prev.pass : String(input.pass),
  };
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(SMTP_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return publicSmtp();
}

export async function transport() {
  if (process.env.ARACHNIDE_SMTP_URL) return { t: nodemailer.createTransport(process.env.ARACHNIDE_SMTP_URL), from: process.env.ARACHNIDE_SMTP_FROM };
  const s = await readSmtp();
  if (!s.host) throw Object.assign(new Error('Email is not configured: set the SMTP server in Scheduled crawls → Email settings.'), { key: 'mail.notConfigured' });
  return {
    t: nodemailer.createTransport({ host: s.host, port: s.port || 587, secure: !!s.secure || s.port === 465, auth: s.user ? { user: s.user, pass: s.pass || '' } : undefined }),
    from: s.from || s.user,
  };
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const { t, from } = await transport();
  const recipients = (Array.isArray(to) ? to : String(to).split(/[,;\s]+/)).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!recipients.length) throw new Error('No valid recipient email address.');
  return t.sendMail({ from: from || recipients[0], to: recipients.join(', '), subject, html, text, attachments });
}
