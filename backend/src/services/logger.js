import { createWriteStream, mkdirSync, readdirSync, unlinkSync, statSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { DB_PATH } from '../config.js';

const LOG_DIR = join(dirname(DB_PATH), 'logs');
const MAX_DAYS = 7;

mkdirSync(LOG_DIR, { recursive: true });

let currentDate = '';
let writeStream = null;
const subscribers = new Set();

// Runtime log level — toggled via Admin → Logs without restart
let _logLevel = 'info'; // 'info' | 'debug'

export function setLogLevel(level) {
  _logLevel = level === 'debug' ? 'debug' : 'info';
}

export function getLogLevel() {
  return _logLevel;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getLogPath(date) {
  return join(LOG_DIR, `tavernshelf-${date}.log`);
}

function getStream() {
  const today = todayStr();
  if (today !== currentDate) {
    if (writeStream) writeStream.end();
    currentDate = today;
    writeStream = createWriteStream(getLogPath(today), { flags: 'a' });
    rotateLogs();
  }
  return writeStream;
}

function rotateLogs() {
  try {
    const files = readdirSync(LOG_DIR)
      .filter(f => f.startsWith('tavernshelf-') && f.endsWith('.log'))
      .sort();
    while (files.length > MAX_DAYS) {
      unlinkSync(join(LOG_DIR, files.shift()));
    }
  } catch {}
}

export function log(level, category, message, meta = {}) {
  // Skip DEBUG entries when not in debug mode
  if (level === 'DEBUG' && _logLevel !== 'debug') return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
  const line = JSON.stringify(entry) + '\n';
  try { getStream().write(line); } catch {}
  for (const sub of subscribers) {
    try { sub(line); } catch { subscribers.delete(sub); }
  }
}

export const logger = {
  info:  (cat, msg, meta = {}) => log('INFO',  cat, msg, meta),
  warn:  (cat, msg, meta = {}) => log('WARN',  cat, msg, meta),
  error: (cat, msg, meta = {}) => log('ERROR', cat, msg, meta),
  event: (cat, msg, meta = {}) => log('EVENT', cat, msg, meta),
  debug: (cat, msg, meta = {}) => log('DEBUG', cat, msg, meta),
};

export function subscribeLogs(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function readRecentLogs(lines = 300) {
  try {
    const content = readFileSync(getLogPath(todayStr()), 'utf8');
    return content.trim().split('\n').filter(Boolean).slice(-lines);
  } catch { return []; }
}

export function listLogFiles() {
  try {
    return readdirSync(LOG_DIR)
      .filter(f => f.startsWith('tavernshelf-') && f.endsWith('.log'))
      .sort().reverse()
      .map(f => ({
        filename: f,
        date: f.replace('tavernshelf-', '').replace('.log', ''),
        size: statSync(join(LOG_DIR, f)).size,
      }));
  } catch { return []; }
}

export function getLogDir() { return LOG_DIR; }
