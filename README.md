# TavernShelf v0.0.1
### Self-hosted TTRPG Digital Library

A secure, self-hosted library for your D&D, Pathfinder, and TTRPG collection — PDFs, CBZ comics, maps, character sheets, and more. Inspired by Audiobookshelf.

---

## Features (v0.0.1)

- **Library browser** — shelf-style grid with cover art, search, and filters by game system, content type, and format
- **In-browser reader** — PDF viewer (paginated, zoomable), CBZ/CBR comic reader, image viewer
- **Metadata editor** — auto-fetch from OpenLibrary and Google Books, or edit manually
- **Folder tree** — respects your existing folder structure, sidebar navigation
- **Secure auth** — JWT sessions, invite-only registration, role system (admin / uploader / member)
- **Upload queue** — campaign members can submit files for admin approval
- **Docker Compose** — single command startup, volumes for persistence

---

## Quick Start

### 1. Prerequisites
- Docker + Docker Compose (v2)
- Your TTRPG library somewhere on disk (any folder structure)

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `LIBRARY_PATH` | Absolute path to your TTRPG folder on the host |
| `JWT_SECRET` | Random secret — run `openssl rand -hex 64` |
| `ADMIN_EMAIL` | Your admin login email |
| `ADMIN_PASSWORD` | Your admin password |
| `PORT` | Port to expose (default: `7624`) |

### 3. Start

```bash
chmod +x start.sh
./start.sh
```

Or manually:

```bash
docker compose up --build -d
```

Open **http://localhost:7624** and sign in with your admin credentials.

---

## Folder Structure

TavernShelf reads your library as-is. No files are moved or renamed on scan. Example:

```
/your/library/
  D&D 5e/
    Core Rules/
      Players Handbook.pdf
      Dungeon Masters Guide.pdf
    Modules/
      Curse of Strahd.pdf
  Pathfinder 2e/
    Core Rulebook.pdf
  Maps/
    Tavern Battle Map.jpg
  Comic Modules/
    Dungeon Crawl Classics 67.cbz
```

---

## User Roles

| Role | Browse & Read | Submit Uploads | Admin Panel |
|---|---|---|---|
| `admin` | ✓ | ✓ | ✓ |
| `uploader` | ✓ | ✓ | — |
| `member` | ✓ | — | — |

Invite users from the Admin panel → Invites tab. Share the generated link with your players.

---

## Supported Formats

| Format | Reader |
|---|---|
| `.pdf` | PDF.js (paginated, zoom) |
| `.cbz`, `.cbr` | JSZip image extractor |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` | Direct image viewer |

---

## Docker Volumes

| Volume | Contents |
|---|---|
| `library` (bind mount) | Your existing TTRPG files — read-only |
| `covers_data` | Generated cover thumbnails (.webp) |
| `uploads_data` | Pending upload queue files |
| `db_data` | SQLite database |

---

## Useful Commands

```bash
# View logs
docker compose logs -f api

# Stop
docker compose down

# Update (after pulling new version)
docker compose up --build -d

# Trigger a library rescan (also in Admin panel)
curl -X POST http://localhost:7624/api/library/scan \
  -H "Authorization: Bearer YOUR_TOKEN"

# Backup database
docker run --rm -v tavernshelf_db_data:/data alpine \
  tar czf - /data > tavernshelf-backup.tar.gz
```

---

## Roadmap

- `v0.0.2` — Reading progress tracking, bookmarks
- `v0.0.3` — Collections / reading lists
- `v0.0.4` — Cover art upload, bulk metadata edit
- `v0.1.0` — Production build (nginx serving static frontend), HTTPS support

---

## Tech Stack

- **Backend** — Node.js 20, Express, better-sqlite3, sharp, yauzl
- **Frontend** — React 18, React Router, PDF.js, Vite
- **Proxy** — Nginx
- **Container** — Docker Compose
