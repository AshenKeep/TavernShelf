import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { COVERS_PATH } from '../config.js';
import { logger } from './logger.js';

mkdirSync(COVERS_PATH, { recursive: true });

const COVER_SIZE = { width: 280, height: 400 };

export async function generateCover(filePath, itemId, fileType) {
  const outFile = join(COVERS_PATH, `${itemId}.webp`);

  // Only skip if existing cover is valid (>1KB) — avoids caching failed extractions
  if (existsSync(outFile)) {
    const { statSync } = await import('fs');
    const size = statSync(outFile).size;
    if (size > 1024) {
      logger.debug('Cover', 'Skipping — valid cover exists', { itemId, size });
      return `/covers/${itemId}.webp`;
    }
    logger.debug('Cover', 'Existing cover too small, regenerating', { itemId, size });
  }

  logger.debug('Cover', 'Generating cover', { itemId, fileType, filePath });

  try {
    if (fileType === 'image') {
      logger.debug('Cover', 'Processing image file', { itemId });
      await sharp(filePath)
        .resize(COVER_SIZE.width, COVER_SIZE.height, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(outFile);
      logger.debug('Cover', 'Image cover generated', { itemId });
      return `/covers/${itemId}.webp`;
    }

    if (fileType === 'cbz') {
      logger.debug('Cover', 'Extracting first image from CBZ', { itemId });
      const imageBuffer = await extractFirstImageFromCbz(filePath);
      if (imageBuffer) {
        await sharp(imageBuffer)
          .resize(COVER_SIZE.width, COVER_SIZE.height, { fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(outFile);
        logger.debug('Cover', 'CBZ cover generated', { itemId });
        return `/covers/${itemId}.webp`;
      }
      logger.warn('Cover', 'No images found in CBZ', { itemId, filePath });
    }

    if (fileType === 'pdf') {
      logger.debug('Cover', 'Rendering PDF page 1 via pdftoppm', { itemId, filePath });
      const extracted = await extractFirstPageFromPdf(filePath, outFile);
      if (extracted) {
        logger.info('Cover', 'PDF cover generated', { itemId });
        return `/covers/${itemId}.webp`;
      }
      logger.warn('Cover', 'PDF cover extraction failed — will use placeholder', { itemId });
      return null;
    }

  } catch (e) {
    logger.error('Cover', 'generateCover threw', { itemId, fileType, error: e.message, stack: e.stack?.split('\n')[1] });
  }

  return null;
}

export async function generatePlaceholderCover(itemId, title) {
  const outFile = join(COVERS_PATH, `${itemId}.webp`);
  if (existsSync(outFile)) {
    const { statSync } = await import('fs');
    if (statSync(outFile).size > 1024) return `/covers/${itemId}.webp`;
  }

  logger.debug('Cover', 'Generating placeholder cover', { itemId, title });

  const cleanTitle = title.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').slice(0, 50);
  const svg = `<svg width="280" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="400" fill="#1c1916" rx="4"/>
    <rect x="14" y="14" width="252" height="372" fill="none" stroke="#c8882a" stroke-width="1" stroke-opacity="0.3" rx="3"/>
    <rect x="20" y="20" width="240" height="360" fill="none" stroke="#c8882a" stroke-width="0.5" stroke-opacity="0.15" rx="2"/>
    <text x="140" y="170" text-anchor="middle" font-family="Georgia,serif" font-size="72" fill="#c8882a" opacity="0.2">⚔</text>
    <line x1="40" y1="200" x2="240" y2="200" stroke="#c8882a" stroke-width="0.5" stroke-opacity="0.3"/>
    <text x="140" y="240" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#b8a888" opacity="0.9"
      textLength="${Math.min(cleanTitle.length * 7, 220)}" lengthAdjust="spacing">
      ${cleanTitle.slice(0, 28)}
    </text>
    ${cleanTitle.length > 28 ? `<text x="140" y="260" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#b8a888" opacity="0.9">${cleanTitle.slice(28, 54)}</text>` : ''}
    <line x1="40" y1="280" x2="240" y2="280" stroke="#c8882a" stroke-width="0.5" stroke-opacity="0.3"/>
  </svg>`;

  try {
    await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(outFile);
    logger.debug('Cover', 'Placeholder cover generated', { itemId });
    return `/covers/${itemId}.webp`;
  } catch (e) {
    logger.error('Cover', 'Placeholder generation failed', { itemId, error: e.message });
    return null;
  }
}

async function extractFirstPageFromPdf(filePath, outFile) {
  const { execFile } = await import('child_process');
  const { mkdirSync, readdirSync } = await import('fs');
  const { join: pjoin, dirname } = await import('path');

  const tmpDir = pjoin(dirname(outFile), `tmp_pdf_${Date.now()}`);
  logger.debug('Cover', 'pdftoppm: creating tmp dir', { tmpDir });

  try {
    mkdirSync(tmpDir, { recursive: true });
    const prefix = pjoin(tmpDir, 'page');

    logger.debug('Cover', 'pdftoppm: spawning', { filePath, prefix, dpi: 72 });

    await new Promise((resolve, reject) => {
      execFile(
        'pdftoppm',
        ['-png', '-f', '1', '-l', '1', '-r', '72', filePath, prefix],
        { maxBuffer: 200 * 1024 * 1024, timeout: 120000 },
        (err, stdout, stderr) => {
          if (err) {
            logger.error('Cover', 'pdftoppm process error', {
              code: err.code, killed: err.killed, signal: err.signal,
              stderr: stderr?.slice(0, 500), message: err.message,
            });
            reject(err);
          } else {
            if (stderr) logger.debug('Cover', 'pdftoppm stderr', { stderr: stderr.slice(0, 200) });
            resolve();
          }
        }
      );
    });

    const files = readdirSync(tmpDir).filter(f => f.endsWith('.png'));
    logger.debug('Cover', 'pdftoppm: output files', { files, tmpDir });

    if (files.length === 0) {
      logger.warn('Cover', 'pdftoppm produced no PNG files', { tmpDir });
      return false;
    }

    const pngPath = pjoin(tmpDir, files[0]);
    logger.debug('Cover', 'sharp: resizing PNG to webp', { pngPath, outFile });

    await sharp(pngPath)
      .resize(280, 400, { fit: 'cover', position: 'top' })
      .webp({ quality: 85 })
      .toFile(outFile);

    logger.debug('Cover', 'pdftoppm: cover written successfully', { outFile });
    return true;

  } catch (e) {
    logger.error('Cover', 'extractFirstPageFromPdf failed', { filePath, error: e.message });
    return false;
  } finally {
    try {
      const { rmSync } = await import('fs');
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn('Cover', 'Failed to clean up tmp dir', { tmpDir, error: e.message });
    }
  }
}

function extractFirstImageFromCbz(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { logger.error('Cover', 'CBZ open failed', { filePath, error: err.message }); return reject(err); }
      const imageEntries = [];
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const name = entry.fileName.toLowerCase();
        if (/\.(jpg|jpeg|png|webp|gif)$/.test(name) && !name.startsWith('__macosx')) {
          imageEntries.push(entry);
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => {
        if (!imageEntries.length) return resolve(null);
        imageEntries.sort((a, b) => a.fileName.localeCompare(b.fileName));
        const first = imageEntries[0];
        zipfile.openReadStream(first, (err, stream) => {
          if (err) return resolve(null);
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', () => resolve(null));
        });
      });
      zipfile.on('error', (e) => { logger.error('Cover', 'CBZ read error', { error: e.message }); resolve(null); });
    });
  });
}
