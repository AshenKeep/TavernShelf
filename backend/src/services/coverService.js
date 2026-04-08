import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
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

    // PDF: generate placeholder cover with title text
    if (fileType === 'pdf') {
      await generatePlaceholderCover(outFile, basename(filePath));
      return `/covers/${itemId}.webp`;
    }
  } catch (e) {
    console.warn(`[Cover] Failed for ${filePath}:`, e.message);
  }

  return null;
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

        // Sort to get the first image (cover)
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

async function generatePlaceholderCover(outFile, title) {
  // Create a simple gradient placeholder with text
  const cleanTitle = title.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').slice(0, 40);

  const svg = `
    <svg width="280" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1a1625"/>
          <stop offset="100%" stop-color="#2d1f3d"/>
        </linearGradient>
      </defs>
      <rect width="280" height="400" fill="url(#bg)" rx="4"/>
      <rect x="20" y="20" width="240" height="360" fill="none" stroke="#6b4fa0" stroke-width="1" stroke-opacity="0.4" rx="2"/>
      <rect x="28" y="28" width="224" height="344" fill="none" stroke="#6b4fa0" stroke-width="0.5" stroke-opacity="0.2" rx="2"/>
      <text
        x="140" y="180"
        text-anchor="middle"
        font-family="serif"
        font-size="64"
        fill="#6b4fa0"
        opacity="0.3"
      >⚔</text>
      <foreignObject x="24" y="220" width="232" height="140">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          color: #e8dff5;
          font-family: Georgia, serif;
          font-size: 15px;
          line-height: 1.4;
          text-align: center;
          word-wrap: break-word;
          padding: 8px;
        ">${cleanTitle}</div>
      </foreignObject>
    </svg>`;

  await sharp(Buffer.from(svg))
    .webp({ quality: 80 })
    .toFile(outFile);
}
