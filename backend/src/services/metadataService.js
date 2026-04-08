import fetch from 'node-fetch';
import { getDb, dbGet, dbRun } from '../db/database.js';

const now = () => Math.floor(Date.now() / 1000);

export async function fetchMetadataByTitle(title) {
  const results = [];
  try { results.push(...await searchOpenLibrary(title)); } catch (e) { console.warn('[Metadata] OpenLibrary:', e.message); }
  try { results.push(...await searchGoogleBooks(title)); } catch (e) { console.warn('[Metadata] Google Books:', e.message); }
  return results;
}

async function searchOpenLibrary(title) {
  const res = await fetch(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5&fields=key,title,author_name,first_publish_year,publisher,subject,cover_i`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.docs || []).map(doc => ({
    source: 'openlibrary',
    title: doc.title || '',
    authors: doc.author_name || [],
    year: doc.first_publish_year || null,
    publisher: (doc.publisher || [])[0] || '',
    tags: (doc.subject || []).slice(0, 10),
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    description: '',
  }));
}

async function searchGoogleBooks(title) {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}&maxResults=5&printType=books`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(item => {
    const info = item.volumeInfo || {};
    return {
      source: 'googlebooks',
      title: info.title || '',
      authors: info.authors || [],
      year: info.publishedDate ? parseInt(info.publishedDate) : null,
      publisher: info.publisher || '',
      tags: info.categories || [],
      coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
      description: info.description || '',
    };
  });
}

export async function applyMetadata(itemId, metadata) {
  const db = await getDb();
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
      metadata_source = $9,
      updated_at      = $10
    WHERE id = $11
  `, [
    metadata.title || null,
    metadata.authors ? JSON.stringify(metadata.authors) : null,
    metadata.description || null,
    metadata.publisher || null,
    metadata.year || null,
    metadata.tags ? JSON.stringify(metadata.tags) : null,
    metadata.system || null,
    metadata.contentType || null,
    metadata.source || 'manual',
    now(),
    itemId,
  ]);
  return dbGet(db, 'SELECT * FROM library_items WHERE id = $1', [itemId]);
}
