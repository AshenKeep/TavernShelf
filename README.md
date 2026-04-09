# TavernShelf

> Self-hosted TTRPG digital library — PDFs, comic modules, maps, character sheets, and more.

TavernShelf lets you host your entire tabletop RPG collection for yourself and your campaign members, accessible from any browser. Inspired by [Audiobookshelf](https://www.audiobookshelf.org/). No cloud. No subscriptions. Your files stay yours.

![GitHub release](https://img.shields.io/github/v/release/AshenKeep/tavernshelf)
![GHCR](https://img.shields.io/badge/ghcr.io-tavernshelf-blue)

---

## Features

- **Shelf-style library** — cover art grid, search, filter by game system, content type, and file format
- **In-browser readers** — PDF viewer (paginated, zoomable), CBZ/CBR comic reader, image viewer for maps and tokens
- **Metadata editor** — auto-fetch from OpenLibrary and Google Books, or fill in manually. TTRPG-aware dropdowns for system and content type
- **Folder tree** — mirrors your existing folder structure exactly. No files are moved or renamed on scan
- **Secure access** — JWT auth, invite-only registration, role-based permissions
- **Upload queue** — campaign members can submit files, you approve or reject them from the admin panel. Approved files are moved directly into your library folder
- **Single container** — one Docker image pulled from GHCR, no build step required

---

## Quick Start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 — check with `docker compose version`
- Your TTRPG files on disk somewhere

### 1. Create a `docker-compose.yml`

```yaml
services:
  tavernshelf:
    image: ghcr.io/ashenkeep/tavernshelf:0.1.1
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

> The library scan runs on startup. Large collections take a few minutes to index.

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
| `DB_PATH` | | `/app/data/pgdata` | Directory where PGlite (embedded Postgres) stores its data |

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

server {
    listen 80;
    server_name tavernshelf.yourdomain.com;
    return 301 https://$host$request_uri;
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

## Folder Structure

TavernShelf reads your library as-is. Nothing is moved, renamed, or copied on scan.

```
/your/ttrpg/library/
├── D&D 5e/
│   ├── Core Rules/
│   │   ├── Players Handbook.pdf
│   │   └── Dungeon Masters Guide.pdf
│   └── Modules/
│       └── Curse of Strahd.pdf
├── Pathfinder 2e/
│   └── Core Rulebook.pdf
├── Maps/
│   └── Tavern Battle Map.jpg
└── Comic Modules/
    └── Dungeon Crawl Classics 67.cbz
```

---

## User Roles

| Role | Browse & Read | Submit Uploads | Admin Panel |
|---|---|---|---|
| `admin` | ✓ | ✓ | ✓ |
| `uploader` | ✓ | ✓ | — |
| `member` | ✓ | — | — |

Invite users from **Admin → Invites**. No public registration.

---

## Supported Formats

| Extension | Reader |
|---|---|
| `.pdf` | PDF.js — paginated, zoom, range request streaming |
| `.cbz` `.cbr` `.cb7` `.cbt` | JSZip — extracted in-browser, page flip |
| `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` | Direct image viewer |

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

# Trigger a library rescan
curl -X POST http://localhost:7624/api/library/scan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Updating

```bash
docker compose pull
docker compose up -d
```

### Backup

```bash
docker run --rm \
  -v tavernshelf_db:/db \
  -v tavernshelf_covers:/covers \
  -v $(pwd):/backup \
  alpine tar czf /backup/tavernshelf-backup-$(date +%Y%m%d).tar.gz /db /covers
```

---

## Troubleshooting

**Port 7624 already in use** — change `PORT=7625` in `.env`, then `docker compose up -d`.

**Library scan finds no files** — check `LIBRARY_PATH` is an absolute path and the folder exists and is readable.

**Permission denied on library (Linux)**
```bash
chmod -R a+rX /path/to/your/ttrpg/library
```

**Approved uploads not appearing** — the library folder needs write permission for the Docker process:
```bash
chmod -R a+rw /path/to/your/ttrpg/library
```

**Forgot admin password**
```bash
docker run --rm -it \
  -v tavernshelf_db:/data \
  alpine sh -c "apk add -q sqlite && sqlite3 /data/tavernshelf.db \
  \"UPDATE users SET password = 'YOUR_BCRYPT_HASH' WHERE role = 'admin';\""
```
Generate a bcrypt hash (12 rounds) at https://bcrypt-generator.com

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
| `0.1.1` | `ghcr.io/ashenkeep/tavernshelf:0.1.1` | Current stable — email invites, upload editing, PDF cover |
| `0.1.0` | `ghcr.io/ashenkeep/tavernshelf:0.1.0` | Campaigns, member roles, item status |
| `0.0.9` | `ghcr.io/ashenkeep/tavernshelf:0.0.9` | File metadata read/write, field locking |
| `0.0.8` | `ghcr.io/ashenkeep/tavernshelf:0.0.8` | Covers fixed, tavern placeholder, /covers route |
| `0.0.7` | `ghcr.io/ashenkeep/tavernshelf:0.0.7` | Auto metadata, ISBN search, user management |
| `0.0.6` | `ghcr.io/ashenkeep/tavernshelf:0.0.6` | Upload fix, credential change, UI polish |
| `0.0.5` | `ghcr.io/ashenkeep/tavernshelf:0.0.5` | Logging, tavern UI, folder creation |
| `0.0.4` | `ghcr.io/ashenkeep/tavernshelf:0.0.4` | PGlite database, backup/restore |
| `0.0.3` | `ghcr.io/ashenkeep/tavernshelf:0.0.3` | SQLite — do not use on CIFS/NFS mounts |
| `latest` | `ghcr.io/ashenkeep/tavernshelf:latest` | Always points to the latest stable release |
| `dev` | `ghcr.io/ashenkeep/tavernshelf:dev` | Latest dev build — may be unstable |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express, sharp, yauzl |
| Frontend | React 18, React Router 6, PDF.js, Vite (built into image) |
| Container | Single Docker image (multi-stage build), GHCR |
| Database | PGlite (embedded Postgres) — works on CIFS/NFS mounts |
