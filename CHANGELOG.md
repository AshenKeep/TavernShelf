# Changelog

All notable changes to TavernShelf are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
