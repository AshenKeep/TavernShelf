export const PORT           = parseInt(process.env.PORT || '3000', 10);
export const JWT_SECRET     = process.env.JWT_SECRET || 'dev-secret-change-me';
export const JWT_EXPIRY     = process.env.JWT_EXPIRY || '7d';
export const LIBRARY_PATH   = process.env.LIBRARY_PATH || '/library';
export const COVERS_PATH    = process.env.COVERS_PATH  || '/app/covers';
export const UPLOADS_PATH   = process.env.UPLOADS_PATH || '/app/uploads';
// PGlite stores data as a directory, not a single file
export const DB_PATH        = process.env.DB_PATH      || '/app/data/pgdata';
// Admin account is created via first-run setup wizard, not env vars
export const NODE_ENV       = process.env.NODE_ENV     || 'development';
export const TRUST_PROXY    = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

export const SUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'cbz', 'cbr', 'cb7', 'cbt',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
]);

export const FILE_TYPE_MAP = {
  pdf:  'pdf',
  cbz:  'cbz', cbr: 'cbz', cb7: 'cbz', cbt: 'cbz',
  jpg:  'image', jpeg: 'image', png: 'image',
  gif:  'image', webp: 'image', svg: 'image',
};
