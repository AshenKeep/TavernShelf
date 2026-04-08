# TavernShelf

> Self-hosted TTRPG digital library — PDFs, comic modules, maps, character sheets, and more.

TavernShelf lets you host your entire tabletop RPG collection for yourself and your campaign members, accessible from any browser. Inspired by [Audiobookshelf](https://www.audiobookshelf.org/). No cloud. No subscriptions. Your files stay yours.

---

## Features

- **Shelf-style library** — cover art grid, search, filter by game system, content type, and file format
- **In-browser readers** — PDF viewer (paginated, zoomable), CBZ/CBR comic reader, image viewer for maps and tokens
- **Metadata editor** — auto-fetch from OpenLibrary and Google Books, or fill in manually. TTRPG-aware dropdowns for system and content type
- **Folder tree** — mirrors your existing folder structure exactly. No files are moved or renamed on scan
- **Secure access** — JWT auth, invite-only registration, role-based permissions
- **Upload queue** — campaign members can submit files, you approve or reject them from the admin panel. Approved files are moved directly into your library folder
- **Single container** — one Docker image, no external dependencies

---

## Quick Start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 — check with `docker compose version`
- Your TTRPG files on disk somewhere (any folder structure works)

### 1. Get the files

```bash
git clone https://github.com/YOUR_USERNAME/tavernshelf.git
cd tavernshelf
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set these four values:

```env
# Absolute path to your TTRPG folder on the host machine
LIBRARY_PATH=/path/to/your/ttrpg/library

# Generate a secret: openssl rand -hex 64
JWT_SECRET=paste_output_here

# Admin account — created automatically on first run
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=choose_a_strong_password
```

### 3. Build and run

```bash
./start.sh
```

Or manually:

```bash
docker compose up --build -d
```

Open **http://localhost:7624** and sign in with your admin credentials.

> The first build compiles the frontend — this takes 2–3 minutes. Subsequent starts are fast.
> The library scan runs automatically on startup. Large collections may take a few minutes to index.

---

## docker-compose.yml

```yaml
services:
  tavernshelf:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tavernshelf
    ports:
      - "${PORT:-7624}:3000"
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - JWT_SECRET=${JWT_SECRET:?JWT_SECRET is required}
      - JWT_EXPIRY=${JWT_EXPIRY:-7d}
      - LIBRARY_PATH=/library
      - COVERS_PATH=/app/covers
      - UPLOADS_PATH=/app/uploads
      - DB_PATH=/app/data/tavernshelf.db
      - ADMIN_EMAIL=${ADMIN_EMAIL:?ADMIN_EMAIL is required}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}
      - TRUST_PROXY=${TRUST_PROXY:-0}
    volumes:
      - ${LIBRARY_PATH:?LIBRARY_PATH is required}:/library
      - covers_data:/app/covers
      - uploads_data:/app/uploads
      - db_data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 15s

volumes:
  covers_data:
  uploads_data:
  db_data:
```

**.env** to go with it:

```env
LIBRARY_PATH=/absolute/path/to/your/ttrpg/library
JWT_SECRET=run_openssl_rand_hex_64_and_paste_here
ADMIN_EMAIL=admin@tavernshelf.local
ADMIN_PASSWORD=changeme
PORT=7624
TRUST_PROXY=0
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIBRARY_PATH` | ✓ | — | Absolute path to your TTRPG folder on the host |
| `JWT_SECRET` | ✓ | — | Random secret for signing tokens — `openssl rand -hex 64` |
| `ADMIN_EMAIL` | ✓ | — | Email for the admin account created on first run |
| `ADMIN_PASSWORD` | ✓ | — | Password for the admin account |
| `PORT` | | `7624` | Host port to expose TavernShelf on |
| `JWT_EXPIRY` | | `7d` | How long login sessions last |
| `TRUST_PROXY` | | `0` | Set to `1` when running behind a reverse proxy |
| `NODE_ENV` | | `production` | Set to `development` for verbose logging |

---

## Reverse Proxy / External Access

TavernShelf runs as a single container on port 7624 (or whatever you set). Putting it behind a reverse proxy is the recommended way to get HTTPS and external access.

**Always set `TRUST_PROXY=1` in your `.env` when using any reverse proxy.**

### nginx

```nginx
server {
    listen 443 ssl;
    server_name tavernshelf.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/tavernshelf.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tavernshelf.yourdomain.com/privkey.pem;

    # Allow large uploads (match your library's largest files)
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

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name tavernshelf.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

### Tailscale (simplest for personal use)

1. Install [Tailscale](https://tailscale.com/) on the host machine
2. Enable HTTPS: `sudo tailscale cert $(tailscale status --json | jq -r .Self.DNSName | tr -d '.')`
3. Enable Tailscale's built-in proxy:
```bash
sudo tailscale serve --bg https / http://localhost:7624
```
4. Set `TRUST_PROXY=1` in your `.env` and restart: `docker compose restart tavernshelf`

TavernShelf will now be available at `https://your-machine.your-tailnet.ts.net` to anyone on your Tailnet.

### Cloudflare Tunnel

1. Create a tunnel in the Cloudflare Zero Trust dashboard
2. Point it at `http://localhost:7624`
3. Set `TRUST_PROXY=1` in your `.env` and restart

---

## Folder Structure

TavernShelf reads your library as-is. Nothing is moved, renamed, or copied on scan. When an upload is approved, the file is moved from the temporary queue into the exact folder the user selected.

```
/your/ttrpg/library/
├── D&D 5e/
│   ├── Core Rules/
│   │   ├── Players Handbook.pdf
│   │   └── Dungeon Masters Guide.pdf
│   └── Modules/
│       ├── Curse of Strahd.pdf
│       └── Tomb of Annihilation.pdf
├── Pathfinder 2e/
│   ├── Core Rulebook.pdf
│   └── Bestiary.pdf
├── Maps/
│   ├── Tavern Battle Map.jpg
│   └── Dungeon - The Sunken Keep.png
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

Users are invited via a time-limited link generated in **Admin → Invites**. There is no public registration.

---

## Supported Formats

| Extension | Type | Reader |
|---|---|---|
| `.pdf` | PDF | PDF.js — paginated, zoom, range request streaming |
| `.cbz` `.cbr` `.cb7` `.cbt` | Comic | JSZip — extracted in-browser, page flip |
| `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` | Image | Direct viewer — maps, tokens, art |

---

## Volumes and Data

| Volume | What's in it |
|---|---|
| Your library (bind mount, read-write) | Your TTRPG files. Read-write so approved uploads can be moved here |
| `covers_data` | Generated cover thumbnails (`.webp`) |
| `uploads_data` | Files submitted by users, pending approval |
| `db_data` | SQLite database (users, metadata, folder index) |

---

## Common Commands

```bash
# Start (first run builds the image — takes a few minutes)
docker compose up --build -d

# Start after first build
docker compose up -d

# View live logs
docker compose logs -f tavernshelf

# Stop
docker compose down

# Restart
docker compose restart tavernshelf

# Rebuild after a code update
docker compose up --build -d

# Trigger a library rescan manually
curl -X POST http://localhost:7624/api/library/scan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Updating

```bash
git pull
docker compose up --build -d
```

### Backup

```bash
# Backup database and covers
docker run --rm \
  -v tavernshelf_db_data:/db \
  -v tavernshelf_covers_data:/covers \
  -v $(pwd):/backup \
  alpine tar czf /backup/tavernshelf-backup-$(date +%Y%m%d).tar.gz /db /covers

# Restore
docker run --rm \
  -v tavernshelf_db_data:/db \
  -v tavernshelf_covers_data:/covers \
  -v $(pwd):/backup \
  alpine tar xzf /backup/tavernshelf-backup-YYYYMMDD.tar.gz -C /
```

> Your TTRPG files are not backed up by TavernShelf — they live in your own folder. Back those up separately.

---

## Troubleshooting

**Port 7624 is already in use**
Change `PORT=7625` (or any free port) in `.env` then `docker compose up -d`.

**Library scan finds no files**
- Check `LIBRARY_PATH` is an absolute path (starts with `/`)
- On Linux/Mac: `ls -la "$LIBRARY_PATH"` to confirm it's readable
- On Windows with Docker Desktop: ensure the drive is shared in Docker Desktop → Settings → Resources → File Sharing
- Check logs: `docker compose logs tavernshelf`

**Permission denied on library folder (Linux)**
```bash
chmod -R a+rX /path/to/your/ttrpg/library
```

**Approved uploads aren't appearing in the library**
The library folder needs write permission for the Docker process. If you're on Linux and the folder is owned by a specific user, add `:rw` permissions or run:
```bash
chmod -R a+rw /path/to/your/ttrpg/library
```

**Container exits immediately**
A required `.env` value is missing or still has a placeholder. Check:
```bash
docker compose logs tavernshelf
```

**Cover images not showing**
Cover generation runs in the background after scanning. Give it a minute on first run, then trigger a rescan from Admin → Library if they're still missing.

**I forgot my admin password**
```bash
# Get a bcrypt hash for your new password first
# Use: https://bcrypt-generator.com (12 rounds)

docker run --rm -it \
  -v tavernshelf_db_data:/data \
  alpine sh -c "apk add -q sqlite && sqlite3 /data/tavernshelf.db \
  \"UPDATE users SET password = 'YOUR_BCRYPT_HASH' WHERE role = 'admin';\""
```

---

## Contributing

Active development happens on the `dev` branch. `main` is reserved for stable releases.

1. Fork the repo
2. Branch off `dev`: `git checkout -b feat/your-feature dev`
3. Make your changes
4. Open a PR targeting `dev`

---

## Roadmap

| Version | Planned |
|---|---|
| `v0.0.2` | Single container, reverse proxy support, rw library mount ✓ |
| `v0.0.3` | Reading progress, bookmarks, last-read position |
| `v0.0.4` | Collections and reading lists |
| `v0.0.5` | Cover art upload, bulk metadata edit |
| `v0.1.0` | HTTPS guide, Unraid/Synology community app templates |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express, better-sqlite3, sharp, yauzl |
| Frontend | React 18, React Router 6, PDF.js, Vite (built into backend image) |
| Container | Single Docker image (multi-stage build) |
| Database | SQLite (WAL mode) |
