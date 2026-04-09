import { PDFDocument } from 'pdf-lib';
import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import sharp from 'sharp';
import yauzl from 'yauzl';
import { COVERS_PATH } from '../config.js';

mkdirSync(COVERS_PATH, { recursive: true });

const COVER_SIZE = { width: 280, height: 400 };

export async function generateCover(filePath, itemId, fileType) {
  const outFile = join(COVERS_PATH, `${itemId}.webp`);
  if (existsSync(outFile)) return `/covers/${itemId}.webp`;

  try {
    if (fileType === 'image') {
      await sharp(filePath)
        .resize(COVER_SIZE.width, COVER_SIZE.height, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(outFile);
      return `/covers/${itemId}.webp`;
    }

    if (fileType === 'cbz') {
      const imageBuffer = await extractFirstImageFromCbz(filePath);
      if (imageBuffer) {
        await sharp(imageBuffer)
          .resize(COVER_SIZE.width, COVER_SIZE.height, { fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(outFile);
        return `/covers/${itemId}.webp`;
      }
    }

    // For PDFs: try to extract the first page as a cover image
    if (fileType === 'pdf') {
      const extracted = await extractFirstPageFromPdf(filePath, outFile);
      if (extracted) return `/covers/${itemId}.webp`;
      // Return null — let metadata auto-fetch try to download a real cover.
      // Placeholder is generated after auto-fetch if still nothing.
      return null;
    }

  } catch (e) {
    console.warn(`[Cover] Failed for ${filePath}:`, e.message);
  }

  return null;
}

// Called explicitly after metadata fetch fails to get a real cover
export async function generatePlaceholderCover(itemId, title) {
  const outFile = join(COVERS_PATH, `${itemId}.webp`);
  if (existsSync(outFile)) return `/covers/${itemId}.webp`;

  const cleanTitle = title.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').slice(0, 50);

  // Tavern-themed placeholder — dark stone with amber accent
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
    await sharp(Buffer.from(svg))
      .webp({ quality: 80 })
      .toFile(outFile);
    return `/covers/${itemId}.webp`;
  } catch (e) {
    console.warn(`[Cover] Placeholder generation failed:`, e.message);
    return null;
  }
}


async function extractFirstPageFromPdf(filePath, outFile) {
  try {
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true }).catch(() => null);
    if (!pdf || pdf.getPageCount() === 0) return false;

    // Extract embedded images from page 1 — look for the largest image
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();

    // Try to find embedded images via XObject resources
    const node = page.node;
    const resources = node.Resources();
    if (!resources) return false;

    const xObjects = resources.XObject();
    if (!xObjects) return false;

    const keys = xObjects.keys();
    let bestBuf = null;
    let bestSize = 0;

    for (const key of keys) {
      try {
        const xobj = xObjects.lookup(key);
        if (!xobj) continue;
        const subtypeVal = xobj.get(xobj.context.obj('Subtype'));
        if (!subtypeVal || subtypeVal.toString() !== '/Image') continue;

        const rawBytes = xobj.getContents ? xobj.getContents() : null;
        if (!rawBytes) continue;

        if (rawBytes.length > bestSize) {
          bestSize = rawBytes.length;
          bestBuf = Buffer.from(rawBytes);
        }
      } catch { continue; }
    }

    if (bestBuf && bestBuf.length > 5000) {
      await sharp(bestBuf)
        .resize(280, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(outFile);
      return true;
    }
    return false;
  } catch (e) {
    // pdf-lib page image extraction is best-effort — silently fail
    return false;
  }
}

function extractFirstImageFromCbz(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
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
      zipfile.on('error', () => resolve(null));
    });
  });
}
