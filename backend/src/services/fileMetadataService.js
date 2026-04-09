import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { LIBRARY_PATH } from '../config.js';
import { logger } from './logger.js';

// ── Read metadata from file ────────────────────────────────

export async function readFileMetadata(relPath) {
  const fullPath = join(LIBRARY_PATH, relPath);
  if (!existsSync(fullPath)) return null;

  const ext = extname(relPath).slice(1).toLowerCase();

  try {
    if (ext === 'pdf') return await readPdfMetadata(fullPath);
    if (ext === 'cbz') return await readCbzMetadata(fullPath);
    return null;
  } catch (e) {
    logger.warn('FileMetadata', 'Read failed', { path: relPath, error: e.message });
    return null;
  }
}

async function readPdfMetadata(filePath) {
  const bytes = readFileSync(filePath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true }).catch(() => null);
  if (!pdf) return null;

  const title     = pdf.getTitle()    || null;
  const authorsRaw= pdf.getAuthor()   || null;
  const subject   = pdf.getSubject()  || null;
  const keywords  = pdf.getKeywords() || null;
  const producer  = pdf.getProducer() || null;

  return {
    title,
    authors:     authorsRaw ? authorsRaw.split(/[,;]/).map(a => a.trim()).filter(Boolean) : [],
    description: subject,
    publisher:   producer,
    tags:        keywords ? keywords.split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
  };
}

async function readCbzMetadata(filePath) {
  const bytes = readFileSync(filePath);
  const zip = await JSZip.loadAsync(bytes);
  const xmlFile = zip.file('ComicInfo.xml') || zip.file(/ComicInfo\.xml$/i)[0];
  if (!xmlFile) return null;

  const xml = await xmlFile.async('text');
  const get = (tag) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    return m ? m[1].trim() : null;
  };

  const title     = get('Title');
  const series    = get('Series');
  const writer    = get('Writer');
  const year      = get('Year');
  const publisher = get('Publisher');
  const genre     = get('Genre');
  const summary   = get('Summary');

  return {
    title:       title || series || null,
    authors:     writer ? writer.split(',').map(a => a.trim()).filter(Boolean) : [],
    description: summary,
    publisher,
    year:        year ? parseInt(year) : null,
    tags:        genre ? genre.split(',').map(t => t.trim()).filter(Boolean) : [],
  };
}

// ── Write metadata to file ─────────────────────────────────

export async function writeFileMetadata(relPath, metadata) {
  const fullPath = join(LIBRARY_PATH, relPath);
  if (!existsSync(fullPath)) throw new Error('File not found on disk');

  const ext = extname(relPath).slice(1).toLowerCase();

  if (ext === 'pdf') return await writePdfMetadata(fullPath, metadata);
  if (ext === 'cbz') return await writeCbzMetadata(fullPath, metadata);
  throw new Error(`Writing metadata to .${ext} files is not supported`);
}

async function writePdfMetadata(filePath, metadata) {
  const bytes = readFileSync(filePath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

  if (metadata.title)       pdf.setTitle(metadata.title);
  if (metadata.authors?.length) pdf.setAuthor(metadata.authors.join(', '));
  if (metadata.description) pdf.setSubject(metadata.description);
  if (metadata.publisher)   pdf.setProducer(metadata.publisher);
  if (metadata.tags?.length) pdf.setKeywords(metadata.tags);

  const written = await pdf.save();
  writeFileSync(filePath, written);
  logger.event('FileMetadata', 'PDF metadata written', { path: filePath });
  return true;
}

async function writeCbzMetadata(filePath, metadata) {
  const bytes = readFileSync(filePath);
  const zip = await JSZip.loadAsync(bytes);

  const xml = buildComicInfoXml(metadata);
  zip.file('ComicInfo.xml', xml);

  const newBytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  writeFileSync(filePath, newBytes);
  logger.event('FileMetadata', 'CBZ ComicInfo.xml written', { path: filePath });
  return true;
}

function buildComicInfoXml(metadata) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = (name, val) => val != null && val !== '' ? `  <${name}>${esc(val)}</${name}>\n` : '';

  return `<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo>\n`
    + tag('Title',     metadata.title)
    + tag('Series',    metadata.title)
    + tag('Writer',    (metadata.authors || []).join(', '))
    + tag('Publisher', metadata.publisher)
    + tag('Year',      metadata.year)
    + tag('Genre',     (metadata.tags || []).join(', '))
    + tag('Summary',   metadata.description)
    + `</ComicInfo>`;
}
