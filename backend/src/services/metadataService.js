import fetch from 'node-fetch';
import { getDb } from '../db/database.js';

export async function fetchMetadataByTitle(title) {
  const results = [];

  try {
    const ol = await searchOpenLibrary(title);
    results.push(...ol);
  } catch (e) {
    console.warn('[Metadata] OpenLibrary failed:', e.message);
  }

  try {
    const gb = await searchGoogleBooks(title);
    results.push(...gb);
  } catch (e) {
    console.warn('[Metadata] Google Books failed:', e.message);
  }

  return results;
}

async function searchOpenLibrary(title) {
  const q = encodeURIComponent(title);
  const res = await fetch(`https://openlibrary.org/search.json?title=${q}&limit=5&fields=key,title,author_name,first_publish_year,publisher,subject,cover_i`, {
    signal: AbortSignal.timeout(8000)
  });
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
  const q = encodeURIComponent(title);
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&printType=books`, {
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) return [];

  const data = await res.json();
  return ((data.items || [])).map(item => {
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

export function applyMetadata(itemId, metadata) {
  const db = getDb();
  db.prepare(`
    UPDATE library_items SET
      title           = COALESCE(?, title),
      authors         = COALESCE(?, authors),
      description     = COALESCE(?, description),
      publisher       = COALESCE(?, publisher),
      year            = COALESCE(?, year),
      tags            = COALESCE(?, tags),
      system          = COALESCE(?, system),
      content_type    = COALESCE(?, content_type),
      metadata_source = ?,
      updated_at      = unixepoch()
    WHERE id = ?
  `).run(
    metadata.title || null,
    metadata.authors ? JSON.stringify(metadata.authors) : null,
    metadata.description || null,
    metadata.publisher || null,
    metadata.year || null,
    metadata.tags ? JSON.stringify(metadata.tags) : null,
    metadata.system || null,
    metadata.contentType || null,
    metadata.source || 'manual',
    itemId
  );

  return db.prepare('SELECT * FROM library_items WHERE id = ?').get(itemId);
}
