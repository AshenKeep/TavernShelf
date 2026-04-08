# Changelog

All notable changes to TavernShelf are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.0.4] — 2026-04-08

### Changed
- Replaced SQLite (better-sqlite3) with PGlite (embedded Postgres) — eliminates SQLITE_BUSY errors on CIFS/NFS mounts
- PGlite stores data as a directory (`/app/data/pgdata`) rather than a single file, which works correctly on all Docker volume types including CIFS-mounted NAS shares
- All database calls converted from synchronous to async/await throughout the entire backend
- `DB_PATH` environment variable now points to a directory, not a file

### Added
- `GET /api/admin/backup` — downloads all library metadata, users, folders, and settings as a portable JSON file
- `POST /api/admin/restore` — restores from a TavernShelf backup JSON file, database-agnostic format
- Admin panel **Backup & Restore** tab with download button and file upload restore
- Backup format is versioned so future migrations are always possible

### Fixed
- SQLITE_BUSY crash loop on CIFS/NFS Docker volumes — root cause was SQLite's reliance on POSIX file locking which CIFS does not support

### Removed
- `better-sqlite3` dependency (and its native build requirements)

---

## [0.0.3] — 2026-04-08

### Fixed
- `SQLITE_BUSY` crash loop on startup — stale `-wal` and `-shm` lock files left by a previously crashed container are now deleted before opening the database
- Added retry logic with 5 attempts and 1s delay between each, so a genuinely busy DB recovers instead of crash-looping
- Set `busy_timeout = 5000` pragma so SQLite waits up to 5s for locks during normal operation

### Changed
- `docker-compose.yml` now pins to explicit version tag `:0.0.3` instead of `:latest`

---

## [0.0.2] — 2026-04-08

### Changed
- Consolidated three containers (nginx + api + frontend) into a single Docker image
- Multi-stage Dockerfile: Vite builds React in stage 1, Express serves the built static files in stage 2
- Library volume mount changed from read-only to read-write so approved uploads can be moved directly into the library folder
- Removed all `VITE_API_URL` environment variable references — frontend always uses `/api` (same origin in production, proxied via Vite in dev)
- `vite.config.js` dev server now proxies `/api` to `localhost:3000` for local development without Docker

### Added
- `TRUST_PROXY` environment variable — set to `1` when running behind nginx, Tailscale, Cloudflare, or any reverse proxy. Enables correct IP logging and HTTPS detection via `X-Forwarded-*` headers
- Content Security Policy headers via Helmet — scoped to allow PDF.js workers and JSZip CDN imports
- Reverse proxy setup guides in README for nginx, Tailscale, and Cloudflare Tunnel

### Fixed
- Duplicate `png` entry in `SUPPORTED_EXTENSIONS`
- Library mount was `:ro` which caused approved upload moves to fail silently
- `app.listen` now explicitly binds to `0.0.0.0` so the container is reachable from the host

### Removed
- `nginx/` directory and `nginx.conf` — no longer needed
- `frontend/Dockerfile` — frontend is now built inside the main multi-stage Dockerfile

---

## [0.0.1] — 2026-04-08

### Added
- Library scanner — auto-indexes folder tree on startup, watches for changes
- Shelf-style grid UI with cover art (inspired by Audiobookshelf)
- In-browser PDF reader (PDF.js, paginated, zoomable)
- In-browser CBZ/CBR comic reader (JSZip client-side extraction)
- Image viewer for maps, tokens, and art (.jpg, .png, .gif, .webp)
- Cover generation — extracts first image from CBZ, styled placeholder for PDFs
- Metadata editor — fetches from OpenLibrary and Google Books by title, full manual override
- TTRPG-specific dropdowns — game system (D&D 5e, PF2e, OSR, etc.) and content type (Module, Bestiary, Pregen, etc.)
- Sidebar folder tree mirroring existing directory structure
- Search and filter by title/author/description, game system, content type, file format
- Sort by title, recently added, size, year
- JWT auth with bcrypt password hashing
- Invite-only registration with time-limited tokens
- Role system: admin / uploader / member
- Upload queue — members submit files, admin approves/rejects with optional reason
- Admin panel — queue management, invite generation, library scan trigger
- Docker Compose setup with Nginx reverse proxy
- SQLite database (WAL mode, foreign keys)
- `start.sh` setup script with config validation
