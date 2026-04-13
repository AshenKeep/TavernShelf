# Changelog

All notable changes to TavernShelf are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.4] — 2026-04-13

### Fixed — Module folder handling

**Upload form:**
- Uploading a file that belongs inside a module (e.g. Maps for Curse of Strahd)
  now has an explicit flow: tick "This file belongs inside an Adventure Module folder",
  pick which module, then pick an optional subfolder (Maps, Handouts, etc.)
- Subfolders of the selected module are shown in the subfolder dropdown — create
  them first via the File Explorer if needed
- Content type (e.g. Battle Maps) remains as a metadata tag for library filtering;
  the file physically stays in the module folder
- A notice in Step 2 confirms the file will stay in the module folder

**Auto-organise:**
- Files inside any `is_module=TRUE` folder are now permanently protected from
  auto-organise, regardless of their content type
- Previously only `managed='manual'` folders were protected; module folders
  marked as auto were still being moved based on content type

---

## [0.1.3] — 2026-04-11

### Added — Navigation, File Explorer, ISBN, Upload flow

**New navigation:**
- Persistent top bar replaces sidebar folder tree: Logo · System dropdown · Library/Files tabs · Search · Sync · Campaigns · Uploads · Admin · User menu
- System dropdown scopes the library view to a specific game system
- Campaigns button always visible regardless of system context

**Library page redesign:**
- Overview shows content type cards per system with cover strip previews
- Clicking a card drills into that content type's book grid
- Adventure Module tab shows module folders as cards
- Content type tabs (top 4 + More dropdown) for quick switching
- Unsorted indicator when files have no system/content type
- Breadcrumb + sort in drill-down view

**Search page (`/search`):**
- Dedicated full-text search page opened via 🔍 button in top bar
- Filters: system, content type, file format, sort
- Auto-focuses search input on open

**File Explorer page (`/files`):**
- Full folder tree with expand/collapse
- Click folder name → browse its books in library
- Admins: hover folder for controls (+ subfolder, ⚔ toggle module, ✕ remove from DB)
- Create folder modal with "Mark as Adventure Module" checkbox
- Users: browse-only, no controls shown
- `DELETE /api/admin/folders/:id` — removes from DB only, does not delete files on disk

**Upload form reordered:**
- Step 1: Game System → Content Type → Module Name (shown only when Adventure Module selected)
- Step 2: Target folder (auto-suggested based on system/type/module name, overridable)
- Step 3: Title, authors, description, tags

**ISBN metadata field:**
- Added `isbn` column to `library_items` (auto-migrated)
- Auto-populated from OpenLibrary/Google Books fetch results
- Editable in MetadataEditor
- Displayed on ItemPage

**Bug fixes:**
- Removed duplicate Organisation tab from Admin panel
- Removed duplicate `PUT /api/library/folders/:id` route

---

## [0.1.2] — 2026-04-09

### Added — Library Organisation

- **First-run setup wizard** — on first boot after pointing at a library, admin is shown a wizard asking whether to enable auto-organisation. Runs a full organise if yes. Can be re-triggered from Admin → Organisation
- **Auto-organisation** — when saving metadata with System + Content Type, file is automatically moved to the correct folder. Structure:
  - `System/Content Type/filename`
  - `System/Adventure Module/Adventure Name/filename` (prompts for adventure folder name)
  - `Unsorted/filename` (files without system or content type)
- **Module folders** — flag a folder as a Module folder (`M` badge in sidebar). Files in manually managed folders (`🔒`) are never auto-moved
- **Misplaced items panel** — Admin → Organisation shows all files not in their expected location, with current path, expected path, and individual Move button
- **Organise All** — moves all misplaced files at once, respects manual folder locks
- **Folder flags** — `PUT /api/library/folders/:id` sets `is_module` and `managed` (auto/manual/null)
- New DB columns: `folders.is_module`, `folders.managed`
- New service: `organiserService.js` (path generation, move, misplaced detection)
- New endpoints: `GET /library/misplaced`, `POST /library/organise`, `POST /library/items/:id/organise`, `GET/PUT /library/organiser-settings`

### Changed
- Metadata save (`PUT /library/items/:id/metadata`) now triggers auto-organise if enabled
- `rebuildFolders` in scanner no longer deletes manually-created empty folders
- Folder creation (admin) writes directly to `folders` table — appears in upload dropdown immediately

---

## [0.1.1] — 2026-04-09

### Fixed
- Campaign member invite `GET /campaigns/item/:itemId` was matched by `GET /campaigns/:id` — moved specific routes before wildcard routes

### Added
- **Upload metadata editing** — in Admin → Upload Queue, click ✎ Edit to expand an inline form and edit title, authors, system, content type, publisher, year, tags, description before approving
- **PDF first-page cover extraction** — when scanning a PDF, TavernShelf now tries to extract the largest embedded image from page 1 as the cover before falling back to an external metadata fetch or placeholder
- **SMTP email** — Admin → Email tab. Configure any SMTP server (host, port, TLS, credentials). Test button verifies connection without sending
- **Email invites for new users** — when inviting someone to a campaign who doesn't have an account, TavernShelf creates an invite token and sends them a registration email. When they register, they are automatically added to the campaign with the correct role
- **Email notification for existing users** — existing users get a notification email when added to a campaign
- `PUT /api/uploads/:id` — update upload queue metadata before approval
- `GET/PUT /api/admin/settings/email` — read/write SMTP settings
- `POST /api/admin/settings/email/test` — test SMTP connection
- `settings` DB table for persistent key-value settings storage

### Changed
- Campaign invite flow now handles both existing and non-existing users in one endpoint

---

## [0.1.0] — 2026-04-09

### Added — Campaigns

A campaign is a named collection owned by a user. Each user manages their own campaigns, can invite other users, and organises library items within each campaign with statuses and notes.

**Campaign management:**
- Any user can create, rename, and delete their own campaigns
- Campaigns page at `/campaigns` lists all campaigns the user owns or is invited to
- Individual campaign page at `/campaigns/:id` with items grid and members list

**Member roles:**
- **Owner** — full control (invite, remove, edit, delete)
- **Collaborator** — can add/remove items and update status/notes
- **Viewer** — read-only access

**Campaign items:**
- Add books to campaigns from the book card (⚔ button) or from the item detail page
- Per-item status: `Reading`, `Completed`, `Reference`, `Wishlist`
- Per-item freetext notes
- Status filter on campaign page
- Remove items from campaign

**Sidebar:**
- Campaigns section in sidebar listing up to 8 of the user's campaigns for quick navigation

**Backend:**
- 3 new DB tables: `campaigns`, `campaign_members`, `campaign_items`
- `GET/POST /api/campaigns` — list / create
- `GET/PUT/DELETE /api/campaigns/:id` — detail / update / delete
- `POST/PUT/DELETE /api/campaigns/:id/members/:userId` — invite / role change / remove
- `GET/POST /api/campaigns/:id/items` — list / add
- `PUT/DELETE /api/campaigns/:id/items/:itemId` — update status+notes / remove
- `GET /api/campaigns/item/:itemId` — campaigns an item belongs to (for the dropdown)

### Changed
- Added D&D 5.5e to game systems list
- Added Magic Items to content types list
- BookCard hover now uses amber accent instead of purple

---

## [0.0.9] — 2026-04-09

### Added
- **Read file metadata** — metadata editor shows what's embedded in the actual PDF or CBZ file on disk, colour-coded against the DB values (green = matches, amber = differs, grey = not in file). Fields with differences show amber border highlight
- **Write metadata to file** (on demand) — "Write DB Metadata to File" button embeds DB metadata back into the source file. PDF via `pdf-lib` (Title, Author, Subject, Keywords, Producer). CBZ via `ComicInfo.xml` inside the zip. Non-destructive — DB save never fails due to a write error
- **Lock fields** — padlock icon (🔒/🔓) on every field. Locked fields are skipped by auto-fetch, preserving manual edits. Lock state persists in `locked_fields` DB column
- `GET /api/library/items/:id/metadata/file` — read raw file metadata
- `POST /api/library/items/:id/metadata/write` — write DB metadata to file
- `PUT /api/library/items/:id/locked-fields` — update locked fields list
- New dependency: `pdf-lib` for PDF read/write, `jszip` for CBZ read/write

### Changed
- `autoFetchMetadata` now respects locked fields — locked fields are never overwritten by background fetches
- `locked_fields` column added to `library_items` table (auto-migrated on startup for existing installs)

---

## [0.0.8] — 2026-04-09

### Fixed
- **Covers not showing in GUI** — `/covers` directory was never mounted as a static route after nginx was removed in v0.0.2. Added `express.static` for `/covers` in `index.js`
- **Purple placeholder replacing real covers** — PDF cover placeholder was written to disk before the metadata auto-fetch had a chance to download a real cover. PDFs now return `null` from `generateCover`, metadata fetch downloads the real cover, and placeholder is only generated if metadata fetch also finds nothing
- Duplicate `existsSync` import in metadataService

### Changed
- Placeholder covers now use the tavern colour scheme (dark stone, amber accents) instead of the old purple gradient
- `downloadCover` now overwrites existing placeholder files when a real cover is found

---

## [0.0.7] — 2026-04-09

### Fixed
- Version string in Docker logs was showing v0.0.5 — all version references in `index.js` now updated correctly
- Upload queue counter in sidebar not clearing after approve/reject — now uses an event bus to notify Layout to refresh

### Added
- **Auto metadata fetch** — when a new file is scanned, TavernShelf automatically searches OpenLibrary and Google Books in the background. Downloads cover art and applies title, authors, publisher, year, description if found. Non-blocking — scan completes immediately
- **ISBN search** — metadata editor now has a By ISBN tab. Searches OpenLibrary's ISBN API directly for accurate results
- **Cover URL fetch** — paste any image URL in the metadata editor to download and apply it as the cover
- **User management tab** in Admin — create users directly (no invite link needed), list all users, change roles, reset passwords, delete accounts
- User management endpoints: `GET/POST /api/admin/users`, `PUT/DELETE /api/admin/users/:id`

### Changed
- Metadata editor shows cover thumbnails in search results
- Search results from ISBN lookup prioritised over title search

---

## [0.0.6] — 2026-04-09

### Fixed
- `EXDEV: cross-device link not permitted` on upload approval — replaced `renameSync` with `copyFileSync` + `unlinkSync` so approved files move correctly across Docker volumes (uploads volume → library volume)
- Log file download returning 401 — browser direct links cannot send auth headers, endpoint now accepts token via query param same as SSE stream

### Added
- **Change credentials** — Admin → Settings tab allows changing email and/or password. Current password required to confirm. Password minimum 8 characters enforced

### Changed
- GUI palette shifted to near-black grey (`#0c0b0a`, `#141210`, `#1c1916`) with warm brown-amber undertones on borders and accents only — less brown, more dark tavern stone

---

## [0.0.5] — 2026-04-09

### Added
- **Error & event logging** — all server events written to daily rotating log files in `/app/data/logs/`. 7-day retention, automatic rotation
- **Live log viewer** in Admin → Logs tab — streams events in real time via Server-Sent Events, colour-coded by level (ERROR/WARN/INFO/EVENT), last 100 lines shown on connect
- **Log file download** — download any of the last 7 days of logs directly from the admin UI
- **Folder creation** — admins can create new folders on disk from the sidebar (+ button per folder for subfolders, + button at top for root folders). Triggers a library rescan automatically
- Logging added to all routes: login attempts, registrations, invite creation, file submissions, approvals, rejections, scan results, metadata updates, errors

### Changed
- **Full tavern GUI reskin** — warm ambers, browns, stone greys, parchment tones replace the previous purple/dark theme
- **New logo** — heraldic shield with colour-coded bookshelves and tankard centrepiece (placeholder until custom artwork)
- **Version display fixed** — sidebar now shows correct version (v0.0.5) pulled from a single constant, not hardcoded to v0.0.1
- Nav active state now shows amber left-border accent instead of background highlight

### Fixed
- Version hardcoded as v0.0.1 in sidebar — now reads from VERSION constant

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
