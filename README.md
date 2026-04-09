# TavernShelf

> Self-hosted TTRPG digital library — PDFs, comic modules, maps, character sheets, and more.

TavernShelf lets you host your entire tabletop RPG collection, accessible from any browser on your local network. Inspired by [Audiobookshelf](https://www.audiobookshelf.org/). No cloud. No subscriptions. Your files stay yours.

![GitHub release](https://img.shields.io/github/v/release/AshenKeep/tavernshelf)
![GHCR](https://img.shields.io/badge/ghcr.io-tavernshelf-blue)

---

## Features

### Library
- **Cover art grid** — auto-fetched covers from OpenLibrary and Google Books, or extracted from PDF/CBZ
- **In-browser readers** — PDF viewer (paginated, zoomable, range streaming), CBZ/CBR comic reader, image viewer
- **Search and filter** — by title, author, game system, content type, and file format
- **Folder tree** — browse by folder in the sidebar, create new folders from the GUI
- **Auto-organise** — files automatically move to `System/ContentType/filename` when metadata is saved. Adventure Modules get their own subfolder. Misplaced files are flagged in Admin

### Metadata
- **Auto-fetch** — on scan, TavernShelf reads embedded PDF/CBZ metadata first, then searches OpenLibrary and Google Books by ISBN or title. Only applies results if the title is a confident match
- **ISBN search** — search by ISBN-10 or ISBN-13 for accurate results
- **Manual editor** — TTRPG-aware dropdowns for game system and content type, cover URL fetch, search result thumbnails
- **File metadata panel** — shows what's embedded in the source file vs what's in the database, colour-coded (green = match, amber = differs, grey = absent)
- **Write to file** — embed DB metadata back into PDF (via pdf-lib) or CBZ (via ComicInfo.xml)
- **Field locking** — lock individual fields so auto-fetch never overwrites your manual edits

### Users & Access
- **JWT auth** — session-based login with configurable expiry
- **Role-based permissions** — admin, uploader, member
- **User management** — create accounts directly, change roles, reset passwords, delete users
- **Invite system** — invite new users by email (sends a registration link) or generate invite links manually
- **Credential change** — admins can change their own email and password from settings

### Upload Queue
- **Submit for approval** — any uploader can submit files; admin approves or rejects
- **Pre-approval editing** — edit title, authors, system, content type, and more before approving
- **Cross-volume move** — uses copy+delete so uploads work regardless of Docker volume configuration

### Campaigns
- **Campaign collections** — any user can create named campaigns to organise books by adventure
- **Member roles** — invite others as Viewer (read-only) or Collaborator (can add/edit items)
- **Item status** — mark each book as Reading, Completed, Reference, or Wishlist
- **Per-item notes** — freetext notes per book per campaign
- **Email invites** — invite someone who doesn't have an account; they get a registration email and are auto-added to the campaign on signup

### Admin
- **Live log viewer** — real-time event stream in Admin → Logs, colour-coded by level, downloadable
- **Backup & restore** — export all metadata as portable JSON, restore to any version
- **Library organisation** — view misplaced files, move them individually or all at once, toggle auto-organise
- **Module folders** — flag folders as Module folders (Auto or Manual managed)
- **SMTP email** — configure any SMTP server for sending invite and campaign emails, test connection
- **Setup wizard** — guides new installs through auto-organise configuration on first boot

### Infrastructure
- **Single Docker container** — one image from GHCR, no build step required
- **PGlite database** — embedded Postgres stored as a directory, works on CIFS/NFS mounts
- **Healthcheck** — container reports healthy/unhealthy, green in VS Code Docker addon

---

## Quick Start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 — check with `docker compose version`
- Your TTRPG files on disk somewhere

### 1. Create a `docker-compose.yml`

```yaml
services:
  tavernshelf:
    image: ghcr.io/ashenkeep/tavernshelf:0.1.2
    container_name: tavernshelf
    ports:
      - "7624:3000"
    environment:
      - JWT_SECRET=your_secret_here
      - ADMIN_EMAIL=you@example.com
      - ADMIN_PASSWORD=yourpassword
      - TRUST_PROXY=0
      - DB_PATH=/app/data/pgdata
    volumes:
      - /absolute/path/to/your/ttrpg/library:/library
      - tavernshelf_covers:/app/covers
      - tavernshelf_uploads:/app/uploads
      - tavernshelf_db:/app/data
    restart: unless-stopped

volumes:
  tavernshelf_covers:
  tavernshelf_uploads:
  tavernshelf_db:
```

### 2. Create a `.env` file next to it

```env
JWT_SECRET=run_openssl_rand_hex_64_and_paste_here
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=yourpassword
LIBRARY_PATH=/absolute/path/to/your/ttrpg/library
PORT=7624
```

### 3. Run

```bash
docker compose up -d
```

Open **http://localhost:7624** — sign in with your admin credentials.

> The library scan runs on startup. Large collections take a few minutes to index. On first login, a setup wizard will ask whether to enable auto-organise.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIBRARY_PATH` | ✓ | — | Absolute path to your TTRPG folder on the host |
| `JWT_SECRET` | ✓ | — | Random secret — `openssl rand -hex 64` |
| `ADMIN_EMAIL` | ✓ | — | Admin account email, created on first run |
| `ADMIN_PASSWORD` | ✓ | — | Admin account password |
| `PORT` | | `7624` | Host port to expose TavernShelf on |
| `JWT_EXPIRY` | | `7d` | How long login sessions last |
| `TRUST_PROXY` | | `0` | Set to `1` when running behind a reverse proxy |
| `DB_PATH` | | `/app/data/pgdata` | Directory where PGlite stores its data |

---

## Auto-Organise Folder Structure

When auto-organise is enabled, TavernShelf moves files to match this structure:

```
/library/
├── D&D 5e/
│   ├── Core Rulebook/
│   │   ├── Players Handbook.pdf
│   │   └── Dungeon Masters Guide.pdf
│   ├── Adventure Module/
│   │   └── Curse of Strahd/
│   │       ├── Core Files/
│   │       └── Maps/
│   ├── Bestiary/
│   └── Supplement/
├── Pathfinder 2e/
│   ├── Core Rulebook/
│   └── Adventure Module/
├── Call of Cthulhu/
└── Unsorted/         ← files with no system or content type
```

Files without a System or Content Type in their metadata go to `Unsorted` for admin review. Auto-organise can be disabled at any time in Admin → Organisation.

---

## User Roles

| Role | Browse & Read | Submit Uploads | Manage Campaigns | Admin Panel |
|---|---|---|---|---|
| `admin` | ✓ | ✓ | ✓ (all) | ✓ |
| `uploader` | ✓ | ✓ | ✓ (own) | — |
| `member` | ✓ | — | ✓ (own) | — |

Admins can create users directly in Admin → Users, or send invite emails from the campaign invite flow.

---

## Campaign Roles

| Role | View Campaign | Add/Edit Items | Invite Members | Delete Campaign |
|---|---|---|---|---|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Collaborator | ✓ | ✓ | — | — |
| Viewer | ✓ | — | — | — |

---

## Supported Formats

| Extension | Reader |
|---|---|
| `.pdf` | PDF.js — paginated, zoom, range request streaming |
| `.cbz` `.cbr` `.cb7` `.cbt` | JSZip — extracted in-browser, page flip |
| `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` | Direct image viewer |

---

## Reverse Proxy / External Access

Set `TRUST_PROXY=1` whenever running behind any reverse proxy.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name tavernshelf.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/tavernshelf.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tavernshelf.yourdomain.com/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass         http://localhost:7624;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### Tailscale

```bash
sudo tailscale serve --bg https / http://localhost:7624
```

Set `TRUST_PROXY=1` in your `.env` and `docker compose restart tavernshelf`.

### Cloudflare Tunnel

Point the tunnel at `http://localhost:7624` and set `TRUST_PROXY=1`.

---

## Common Commands

```bash
# Start
docker compose up -d

# Pull latest image and restart
docker compose pull && docker compose up -d

# View logs
docker compose logs -f tavernshelf

# Stop
docker compose down

# Trigger a library rescan (requires auth token)
curl -X POST http://localhost:7624/api/library/scan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

**Port 7624 already in use** — change `PORT=7625` in `.env`, then `docker compose up -d`.

**Library scan finds no files** — check `LIBRARY_PATH` is an absolute path and the folder exists and is readable.

**Permission denied on library (Linux)**
```bash
chmod -R a+rX /path/to/your/ttrpg/library
```

**Approved uploads not appearing** — the library folder needs write permission:
```bash
chmod -R a+rw /path/to/your/ttrpg/library
```

**Forgot admin password** — use Admin → Settings → Change Credentials, or reset via the database:
```bash
docker run --rm -it \
  -v tavernshelf_db:/data \
  node:20-alpine sh -c "
    cd /data && node -e \"
      const { PGlite } = require('@electric-sql/pglite');
      // Use the TavernShelf admin UI instead — Admin -> Settings
    \"
  "
```
The easiest approach is to use Admin → Settings → Change Credentials while logged in.

**Container shows yellow/unhealthy in VS Code** — the healthcheck polls `http://127.0.0.1:3000/api/health` every 30 seconds. Give it 1–2 minutes after startup to go green.

---

## Building from Source

```bash
git clone https://github.com/AshenKeep/tavernshelf.git
cd tavernshelf
cp .env.example .env
# edit .env
docker compose -f docker-compose.build.yml up --build -d
```

---

## Contributing

Development happens on the `dev` branch. `main` is for stable releases.

1. Fork the repo
2. Branch off `dev`: `git checkout -b feat/your-feature dev`
3. Open a PR targeting `dev`

---

## Available Versions

| Version | Image | Notes |
|---|---|---|
| `0.1.2` | `ghcr.io/ashenkeep/tavernshelf:0.1.2` | Current stable — auto-organise, setup wizard, module folders |
| `0.1.1` | `ghcr.io/ashenkeep/tavernshelf:0.1.1` | Email invites, campaign invite flow, upload metadata editing |
| `0.1.0` | `ghcr.io/ashenkeep/tavernshelf:0.1.0` | Campaigns with member roles, item status, notes |
| `0.0.9` | `ghcr.io/ashenkeep/tavernshelf:0.0.9` | File metadata read/write, field locking |
| `0.0.8` | `ghcr.io/ashenkeep/tavernshelf:0.0.8` | Covers fixed, healthcheck fix |
| `0.0.7` | `ghcr.io/ashenkeep/tavernshelf:0.0.7` | Auto metadata fetch, ISBN search, user management |
| `0.0.6` | `ghcr.io/ashenkeep/tavernshelf:0.0.6` | Upload approval fix, credential change |
| `0.0.5` | `ghcr.io/ashenkeep/tavernshelf:0.0.5` | Live logging, tavern UI, folder creation |
| `0.0.4` | `ghcr.io/ashenkeep/tavernshelf:0.0.4` | PGlite database, backup/restore |
| `0.0.3` | `ghcr.io/ashenkeep/tavernshelf:0.0.3` | SQLite — do not use on CIFS/NFS mounts |
| `latest` | `ghcr.io/ashenkeep/tavernshelf:latest` | Always points to the latest stable release |
| `dev` | `ghcr.io/ashenkeep/tavernshelf:dev` | Latest dev build — may be unstable |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express, pdf-lib, sharp, yauzl, jszip, nodemailer |
| Frontend | React 18, React Router 6, PDF.js, Vite (built into image) |
| Container | Single Docker image (multi-stage build), GHCR |
| Database | PGlite (embedded Postgres) — works on CIFS/NFS mounts |
