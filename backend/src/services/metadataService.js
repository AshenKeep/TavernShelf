import { existsSync } from 'fs';
import { readFileMetadata } from './fileMetadataService.js';
import fetch from 'node-fetch';
import { join } from 'path';
import { getDb, dbGet, dbRun } from '../db/database.js';
import { COVERS_PATH } from '../config.js';
import { logger } from './logger.js';
import sharp from 'sharp';

const now = () => Math.floor(Date.now() / 1000);

// ── ISBN extraction from PDF metadata ─────────────────────
export function extractIsbnFromText(text) {
  if (!text) return null;
  // Match ISBN-13 (978/979 prefix) or ISBN-10
  const match = text.match(/(?:ISBN[:\s-]*)?(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?\d|(?:\d[-\s]?){9}[\dXx])/i);
  if (!match) return null;
  return match[0].replace(/[-\s]/g, '').toUpperCase();
}

// ── Cover image download ───────────────────────────────────
export async function downloadCover(url, itemId, force = false) {
  const outFile = join(COVERS_PATH, `${itemId}.webp`);
  // Skip if real cover already exists (not a placeholder) and not forced
  if (!force && existsSync(outFile)) return `/covers/${itemId}.webp`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    await sharp(buffer)
      .resize(280, 400, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(outFile);
    return `/covers/${itemId}.webp`;
  } catch (e) {
    logger.warn('Metadata', 'Cover download failed', { url, error: e.message });
    return null;
  }
}

// ── Search by ISBN ─────────────────────────────────────────
async function searchByIsbn(isbn) {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const book = data[`ISBN:${isbn}`];
    if (!book) return null;

    const coverId = book.cover?.large || book.cover?.medium || book.cover?.small;
    return {
      source:    'openlibrary-isbn',
      title:     book.title || '',
      authors:   (book.authors || []).map(a => a.name),
      year:      book.publish_date ? parseInt(book.publish_date) : null,
      publisher: (book.publishers || [])[0]?.name || '',
      tags:      (book.subjects || []).slice(0, 10).map(s => s.name || s),
      coverUrl:  coverId || null,
      description: book.excerpts?.[0]?.text || '',
      isbn,
    };
  } catch (e) {
    logger.warn('Metadata', 'ISBN lookup failed', { isbn, error: e.message });
    return null;
  }
}

// ── Search OpenLibrary by title ────────────────────────────
async function searchOpenLibrary(title) {
  const res = await fetch(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5&fields=key,title,author_name,first_publish_year,publisher,subject,cover_i`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.docs || []).map(doc => ({
    source:    'openlibrary',
    title:     doc.title || '',
    authors:   doc.author_name || [],
    year:      doc.first_publish_year || null,
    publisher: (doc.publisher || [])[0] || '',
    tags:      (doc.subject || []).slice(0, 10),
    coverUrl:  doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    description: '',
  }));
}

// ── Search Google Books by title or ISBN ───────────────────
async function searchGoogleBooks(query, isIsbn = false) {
  const q = isIsbn ? `isbn:${query}` : encodeURIComponent(query);
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&printType=books`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(item => {
    const info = item.volumeInfo || {};
    return {
      source:    isIsbn ? 'googlebooks-isbn' : 'googlebooks',
      title:     info.title || '',
      authors:   info.authors || [],
      year:      info.publishedDate ? parseInt(info.publishedDate) : null,
      publisher: info.publisher || '',
      tags:      info.categories || [],
      coverUrl:  info.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
      description: info.description || '',
      isbn:      (info.industryIdentifiers || []).find(i => i.type === 'ISBN_13')?.identifier || null,
    };
  });
}

// ── Public search (used by manual metadata editor) ─────────
export async function fetchMetadataByTitle(title) {
  const results = [];
  try {
    const ol = await searchOpenLibrary(title);
    logger.debug('Metadata', 'OpenLibrary results', { title, count: ol.length });
    if (ol.length === 0) logger.warn('Metadata', 'OpenLibrary returned 0 results', { title });
    results.push(...ol);
  } catch (e) { logger.warn('Metadata', 'OpenLibrary search failed', { error: e.message }); }
  try {
    const gb = await searchGoogleBooks(title);
    logger.debug('Metadata', 'Google Books results', { title, count: gb.length });
    if (gb.length === 0) logger.warn('Metadata', 'Google Books returned 0 results', { title });
    results.push(...gb);
  } catch (e) { logger.warn('Metadata', 'Google Books search failed', { error: e.message }); }
  return results;
}

export async function fetchMetadataByIsbn(isbn) {
  const results = [];
  try {
    const olResult = await searchByIsbn(isbn);
    if (olResult) results.push(olResult);
  } catch (e) { logger.warn('Metadata', 'ISBN search failed', { error: e.message }); }
  try { results.push(...await searchGoogleBooks(isbn, true)); } catch (e) {}
  return results;
}

// ── Auto-fetch metadata for a newly scanned item ──────────
// Runs in background after scan — non-blocking
export async function autoFetchMetadata(itemId, title, filePath) {
  const db = await getDb();
  try {
    const item = await dbGet(db, 'SELECT metadata_source, cover_path, locked_fields, file_type FROM library_items WHERE id = $1', [itemId]);
    // Only auto-fetch if we haven't already fetched from an external source
    if (!item || item.metadata_source !== 'filename') return;
    const locked = JSON.parse(item.locked_fields || '[]');

    logger.info('Metadata', 'Auto-fetching metadata', { title });

    let results = [];
    let searchTitle = title;

    // Step 1: try to read metadata embedded in the file itself
    // This gives us a more accurate title/ISBN than the filename
    if (['pdf', 'cbz'].includes(item.file_type)) {
      try {
        const fileMeta = await readFileMetadata(filePath);
        if (fileMeta) {
          // Use file's embedded title as search query if it looks more complete than the filename
          if (fileMeta.title && fileMeta.title.length > 3) {
            searchTitle = fileMeta.title;
            logger.info('Metadata', 'Using embedded file title for search', { fileTitle: searchTitle });
          }
          // Check for ISBN in file description/keywords
          const isbnFromFile = extractIsbnFromText(JSON.stringify(fileMeta));
          if (isbnFromFile) {
            logger.info('Metadata', 'Found ISBN in file metadata', { isbn: isbnFromFile });
            results = await fetchMetadataByIsbn(isbnFromFile);
          }
        }
      } catch (e) {
        logger.warn('Metadata', 'Could not read file metadata', { error: e.message });
      }
    }

    // Step 2: try ISBN from filename/title if no results yet
    if (!results.length) {
      const isbnFromFilename = extractIsbnFromText(title);
      if (isbnFromFilename) {
        logger.info('Metadata', 'Found ISBN in filename', { isbn: isbnFromFilename });
        results = await fetchMetadataByIsbn(isbnFromFilename);
      }
    }

    // Step 3: fall back to title search using best available title
    if (!results.length) {
      results = await fetchMetadataByTitle(searchTitle);
    }

    if (!results.length) {
      logger.info('Metadata', 'No metadata found', { title });
      return;
    }

    const best = results[0];

    // Confidence check — only apply if the result title is a reasonable match
    // For ISBN lookups we trust the result fully; for title searches we check similarity
    const isIsbnResult = best.source.includes('isbn');
    if (!isIsbnResult && best.title) {
      const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const searchNorm = normalize(searchTitle);
      const resultNorm = normalize(best.title);

      // Check if enough words from our search appear in the result
      const searchWords = searchNorm.split(' ').filter(w => w.length > 2);
      const matchingWords = searchWords.filter(w => resultNorm.includes(w));
      const matchRatio = searchWords.length > 0 ? matchingWords.length / searchWords.length : 0;

      if (matchRatio < 0.5) {
        logger.info('Metadata', 'Low confidence match — skipping auto-apply',
          { search: searchTitle, found: best.title, matchRatio: matchRatio.toFixed(2) });
        return;
      }
    }

    logger.info('Metadata', 'Auto-applying metadata', { title, source: best.source, found: best.title });

    // Download cover if available and we don't have one yet
    let coverPath = item.cover_path;
    if (best.coverUrl && (!coverPath || coverPath.includes('placeholder'))) {
      const downloaded = await downloadCover(best.coverUrl, itemId);
      if (downloaded) {
        coverPath = downloaded;
        logger.info('Metadata', 'Cover downloaded', { itemId, url: best.coverUrl });
      }
    }

    // Respect locked fields — skip any field the user has locked
    const skip = (field, val) => locked.includes(field) ? null : val;

    await dbRun(db, `
      UPDATE library_items SET
        title           = COALESCE($1, title),
        authors         = COALESCE($2, authors),
        description     = COALESCE($3, description),
        publisher       = COALESCE($4, publisher),
        year            = COALESCE($5, year),
        tags            = COALESCE($6, tags),
        cover_path      = COALESCE($7, cover_path),
        isbn            = COALESCE($8, isbn),
        metadata_source = $9,
        updated_at      = $10
      WHERE id = $11
    `, [
      skip('title',       best.title || null),
      skip('authors',     best.authors?.length ? JSON.stringify(best.authors) : null),
      skip('description', best.description || null),
      skip('publisher',   best.publisher || null),
      skip('year',        best.year || null),
      skip('tags',        best.tags?.length ? JSON.stringify(best.tags) : null),
      skip('cover',       coverPath || null),
      best.isbn || null,
      best.source,
      now(),
      itemId,
    ]);
  } catch (e) {
    logger.error('Metadata', 'Auto-fetch failed', { itemId, error: e.message });
  }
}

// ── Apply metadata manually (from editor) ─────────────────
export async function applyMetadata(itemId, metadata) {
  const db = await getDb();

  // If a coverUrl is provided, download it
  let coverPath = null;
  if (metadata.coverUrl) {
    coverPath = await downloadCover(metadata.coverUrl, itemId);
  }

  await dbRun(db, `
    UPDATE library_items SET
      title           = COALESCE($1, title),
      authors         = COALESCE($2, authors),
      description     = COALESCE($3, description),
      publisher       = COALESCE($4, publisher),
      year            = COALESCE($5, year),
      tags            = COALESCE($6, tags),
      system          = COALESCE($7, system),
      content_type    = COALESCE($8, content_type),
      cover_path      = COALESCE($9, cover_path),
      isbn            = COALESCE($10, isbn),
      metadata_source = $11,
      updated_at      = $12
    WHERE id = $13
  `, [
    metadata.title || null,
    metadata.authors ? JSON.stringify(metadata.authors) : null,
    metadata.description || null,
    metadata.publisher || null,
    metadata.year || null,
    metadata.tags ? JSON.stringify(metadata.tags) : null,
    metadata.system || null,
    metadata.contentType || null,
    coverPath || null,
    metadata.isbn || null,
    metadata.source || 'manual',
    now(),
    itemId,
  ]);

  return dbGet(db, 'SELECT * FROM library_items WHERE id = $1', [itemId]);
}
