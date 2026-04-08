export const PORT         = process.env.PORT || 3000;
export const JWT_SECRET   = process.env.JWT_SECRET || 'dev-secret-change-me';
export const JWT_EXPIRY   = process.env.JWT_EXPIRY || '7d';
export const LIBRARY_PATH = process.env.LIBRARY_PATH || '/library';
export const COVERS_PATH  = process.env.COVERS_PATH  || '/app/covers';
export const UPLOADS_PATH = process.env.UPLOADS_PATH || '/app/uploads';
export const DB_PATH      = process.env.DB_PATH      || '/app/data/tavernshelf.db';
export const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'admin@tavernshelf.local';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
export const NODE_ENV     = process.env.NODE_ENV     || 'development';

export const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'cbz', 'cbr', 'cb7', 'cbt',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'png'
]);

export const FILE_TYPE_MAP = {
  pdf:  'pdf',
  cbz:  'cbz',
  cbr:  'cbz',
  cb7:  'cbz',
  cbt:  'cbz',
  jpg:  'image',
  jpeg: 'image',
  png:  'image',
  gif:  'image',
  webp: 'image',
  svg:  'image',
};
