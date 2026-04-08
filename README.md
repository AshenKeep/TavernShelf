# TavernShelf

> Self-hosted TTRPG digital library — PDFs, comic modules, maps, character sheets, and more.

TavernShelf lets you host your entire tabletop RPG collection for yourself and your campaign members, accessible from any browser. Inspired by [Audiobookshelf](https://www.audiobookshelf.org/). No cloud. No subscriptions. Your files stay yours.

---

## Features

- **Shelf-style library** — cover art grid, search, filter by game system, content type, and file format
- **In-browser readers** — PDF viewer (paginated, zoomable), CBZ/CBR comic reader, image viewer for maps and tokens
- **Metadata editor** — auto-fetch from OpenLibrary and Google Books, or fill in manually. TTRPG-aware dropdowns for system and content type
- **Folder tree** — mirrors your existing folder structure exactly. No files are moved or renamed
- **Secure access** — JWT auth, invite-only registration, role-based permissions
- **Upload queue** — campaign members can submit files, you approve or reject them from the admin panel
- **Docker Compose** — runs as a set of containers, single command to start

---

## Quick Start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 (`docker compose version`)
- Your TTRPG files on disk somewhere (any folder structure works)

### 1. Get the files

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/tavernshelf.git
cd tavernshelf

# Or download the zip from Releases and unzip it
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

# Admin account created on first run
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=choose_a_strong_password
```

Everything else has sensible defaults. Full reference in [`.env.example`](.env.example).

### 3. Build and run

```bash
docker compose up --build -d
```

Then open **http://localhost:7624** and sign in with your admin credentials.

> The library scan runs automatically on startup. Large collections may take a few minutes to index — check logs with `docker compose logs -f api`.

---

## Copy-paste docker-compose.yml

If you just want the compose file without cloning, copy this and create a `.env` file next to it:

```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: tavernshelf-nginx
    ports:
      - "${PORT:-7624}:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - covers_data:/app/covers:ro
    depends_on:
      api:
        condition: service_healthy
      frontend:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - tavernshelf

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: tavernshelf-api
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
    volumes:
      - ${LIBRARY_PATH:?LIBRARY_PATH is required}:/library:ro
      - covers_data:/app/covers
      - uploads_data:/app/uploads
      - db_data:/app/data
    restart: unless-stopped
    networks:
      - tavernshelf
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 15s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=/api
    container_name: tavernshelf-frontend
    restart: unless-stopped
    networks:
      - tavernshelf
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:5173"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 20s

volumes:
  covers_data:
  uploads_data:
  db_data:

networks:
  tavernshelf:
    driver: bridge
```

**.env** file to go with it:

```env
LIBRARY_PATH=/absolute/path/to/your/ttrpg/library
JWT_SECRET=run_openssl_rand_hex_64_and_paste_here
ADMIN_EMAIL=admin@tavernshelf.local
ADMIN_PASSWORD=changeme
PORT=7624
```

You will still need the full repo for the `nginx/nginx.conf`, `backend/`, and `frontend/` source — grab it from [Releases](../../releases).

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIBRARY_PATH` | ✓ | — | Absolute path to your TTRPG folder on the host |
| `JWT_SECRET` | ✓ | — | Random secret for signing tokens. Run `openssl rand -hex 64` |
| `ADMIN_EMAIL` | ✓ | — | Email for the admin account created on first run |
| `ADMIN_PASSWORD` | ✓ | — | Password for the admin account |
| `PORT` | | `7624` | Host port to expose TavernShelf on |
| `JWT_EXPIRY` | | `7d` | How long login sessions last |
| `NODE_ENV` | | `production` | Set to `development` for verbose logging |

---

## Folder Structure

TavernShelf reads your library as-is. Nothing is moved, renamed, or copied. Example:

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

The sidebar folder tree in the UI mirrors this structure exactly.

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
| `.cbz` `.cbr` | Comic | JSZip — extracted in-browser, page flip |
| `.jpg` `.jpeg` `.png` `.gif` `.webp` | Image | Direct viewer — maps, tokens, art |

---

## Volumes and Data

| Volume | What's in it |
|---|---|
| Your library (bind mount, read-only) | Your TTRPG files — never modified |
| `covers_data` | Generated cover thumbnails (`.webp`) |
| `uploads_data` | Files submitted by users pending approval |
| `db_data` | SQLite database (users, metadata, folder index) |

---

## Common Commands

```bash
# Start (first run builds the images)
docker compose up --build -d

# Start (subsequent runs, no rebuild)
docker compose up -d

# Stop
docker compose down

# View live logs
docker compose logs -f api
docker compose logs -f frontend

# Restart a single service
docker compose restart api

# Rebuild after a code update
docker compose up --build -d

# Trigger a library rescan manually
curl -X POST http://localhost:7624/api/library/scan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Updating to a new version

```bash
git pull
docker compose up --build -d
```

Docker will only rebuild images that have changed.

### Backup

```bash
# Backup the database
docker run --rm \
  -v tavernshelf_db_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tavernshelf-db-$(date +%Y%m%d).tar.gz /data

# Restore
docker run --rm \
  -v tavernshelf_db_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/tavernshelf-db-YYYYMMDD.tar.gz -C /
```

> Your TTRPG files are not backed up by TavernShelf — they live in your own folder and are mounted read-only. Back those up separately however you prefer.

---

## Troubleshooting

**Port 7624 is already in use**
Change `PORT=7625` (or any free port) in your `.env`.

**Library scan finds no files**
- Check `LIBRARY_PATH` is the absolute path, not a relative one
- On Linux/Mac, check the folder is readable: `ls -la $LIBRARY_PATH`
- On Windows with Docker Desktop, make sure the drive is shared in Docker Desktop → Settings → Resources → File Sharing
- Check logs: `docker compose logs -f api`

**Permission denied on library folder (Linux)**
Docker runs as root inside the container. If your library folder is restricted:
```bash
chmod -R a+rX /path/to/your/ttrpg/library
```

**Containers restart immediately after starting**
Check the logs — most likely a missing or incorrect `.env` value:
```bash
docker compose logs api
```

**Frontend shows blank page or 502**
The api container may still be starting up. The frontend waits for the api healthcheck to pass — give it up to 60 seconds on first run. Watch with:
```bash
docker compose ps
```

**I forgot my admin password**
Connect to the database container and reset it:
```bash
docker run --rm -it \
  -v tavernshelf_db_data:/data \
  alpine sh -c "apk add sqlite && sqlite3 /data/tavernshelf.db"

-- Inside sqlite3:
UPDATE users SET password = '$2a$12$...' WHERE role = 'admin';
-- (generate a bcrypt hash first — use https://bcrypt-generator.com/ with 12 rounds)
```

---

## Contributing

This project is on the `dev` branch during active development. `main` is reserved for stable releases.

1. Fork the repo
2. Branch off `dev`: `git checkout -b feat/your-feature dev`
3. Make your changes
4. Open a PR targeting `dev`

---

## Roadmap

| Version | Planned |
|---|---|
| `v0.0.2` | Reading progress, bookmarks, last-read position |
| `v0.0.3` | Collections and reading lists |
| `v0.0.4` | Cover art upload, bulk metadata edit |
| `v0.1.0` | Production build — nginx serves static frontend, HTTPS/reverse proxy guide |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express, better-sqlite3, sharp, yauzl |
| Frontend | React 18, React Router 6, PDF.js, Vite |
| Proxy | Nginx (Alpine) |
| Container | Docker Compose |
| Database | SQLite (WAL mode) |

