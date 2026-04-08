# Affordable Mobile Mechanics — Deployment & Self-Hosting Guide

This guide covers everything needed to run the app independently from Perplexity on infrastructure you control.

---

## Table of Contents

1. [Stack Overview](#1-stack-overview)
2. [Running Locally (Development)](#2-running-locally-development)
3. [Running Locally (Production Build)](#3-running-locally-production-build)
4. [Deploying on a VPS or Cloud Server](#4-deploying-on-a-vps-or-cloud-server)
5. [Docker Deployment](#5-docker-deployment)
6. [SQLite Database — Persistent Storage](#6-sqlite-database--persistent-storage)
7. [Restoring from a Backup](#7-restoring-from-a-backup)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Zoho & Twilio Integration Activation](#9-zoho--twilio-integration-activation)
10. [Domain and HTTPS](#10-domain-and-https)
11. [Deploying on Render (with Persistent Disk)](#11-deploying-on-render-with-persistent-disk)
12. [DATABASE_PATH — Controlling the Database Location](#12-databasepath--controlling-the-database-location)
13. [Default Credentials / First Login](#13-default-credentials--first-login)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Stack Overview

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Runtime     | Node.js 20 LTS                                  |
| Server      | Express 5 (TypeScript, compiled via esbuild)    |
| Frontend    | React 18 + Vite (compiled to static assets)     |
| UI          | Tailwind CSS v3 + shadcn/ui (Radix primitives)  |
| Database    | SQLite via `better-sqlite3` + Drizzle ORM       |
| Auth        | Custom session cookies (no Passport in routes)  |
| Messaging   | Twilio (SMS) / Zoho Mail (email) — both optional|
| CRM Sync    | Zoho CRM / Zoho Books — both optional           |

**Single-process, single-port:** The Express server serves both the REST API (`/api/...`) and the compiled frontend static files on the same port. No separate web server is needed for basic operation.

**No external database required.** SQLite is embedded — the entire database is a single file (`data.db`). This makes the app very easy to run on a small VPS.

---

## 2. Running Locally (Development)

Requirements: Node.js 20 LTS, npm 9+.

```bash
# 1. Enter the project directory
cd affordable-mobile-mechanics-app

# 2. Install dependencies
npm install

# 3. Start the dev server (auto-reload on changes)
npm run dev
```

The app runs at **http://localhost:5000** by default. Vite HMR is active in development mode. The SQLite database is created as `data.db` in the project root on first run.

---

## 3. Running Locally (Production Build)

```bash
# 1. Build frontend + server bundle
npm run build

# 2. Start the production server
npm start
```

`npm run build` produces:
- `dist/index.cjs` — bundled Express server
- `dist/public/` — compiled frontend (HTML + JS + CSS + assets)

`npm start` runs `NODE_ENV=production node dist/index.cjs`.

---

## 4. Deploying on a VPS or Cloud Server

Tested on Ubuntu 22.04. Adapt commands for other distros.

### 4.1 Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 4.2 Transfer the source

Option A — Clone from your own Git repository (recommended):
```bash
git clone https://github.com/YOUR_ORG/affordable-mobile-mechanics-app.git
cd affordable-mobile-mechanics-app
```

Option B — Upload the ZIP from this package, then extract:
```bash
unzip amm-self-hosting.zip
cd affordable-mobile-mechanics-app
```

### 4.3 Install dependencies and build

```bash
npm install
npm run build
```

### 4.4 Configure environment

```bash
cp .env.example .env
# Edit .env with your preferred editor:
nano .env
```

Set at minimum:
```
NODE_ENV=production
PORT=5000
```

### 4.5 Run the server

**Simple foreground run (for testing):**
```bash
npm start
```

**Recommended: systemd service for production**

Create `/etc/systemd/system/amm.service`:
```ini
[Unit]
Description=Affordable Mobile Mechanics App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/affordable-mobile-mechanics-app
EnvironmentFile=/home/ubuntu/affordable-mobile-mechanics-app/.env
ExecStart=/usr/bin/node dist/index.cjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable amm
sudo systemctl start amm
sudo systemctl status amm
```

---

## 5. Docker Deployment

A `Dockerfile` and `docker-compose.yml` are included in the project root.

### Quick start

```bash
# Build and start in the background
docker compose up -d

# Tail logs
docker compose logs -f app

# Stop (keeps the database volume)
docker compose down
```

The app is accessible at **http://your-server-ip:3000** (mapped from container port 5000).

### Important: database volume

The `docker-compose.yml` creates a named volume `amm-data` and mounts it at `/app/data-volume` inside the container. By default the app still writes `data.db` to `/app/data.db` (working directory). To make the database land inside the volume, see [Section 11 — DATABASE_PATH Patch](#11-optional-databasepath-patch).

Alternatively, edit the volume mount target in `docker-compose.yml`:
```yaml
volumes:
  - amm-data:/app   # mount the volume as the entire /app directory
```
This puts `data.db` inside the named volume automatically. Note: this also means the `dist/` files must be inside the image — which they are after `docker compose build`.

### Rebuild after code changes

```bash
docker compose build
docker compose up -d
```

---

## 6. SQLite Database — Persistent Storage

The database file is `data.db` (plus WAL files `data.db-shm` and `data.db-wal`) in the server's working directory.

### Key facts

- SQLite runs entirely in-process — no separate database server.
- WAL mode is enabled (`PRAGMA journal_mode = WAL`) for better concurrency.
- Schema migrations are applied automatically at startup via inline `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` statements in `server/storage.ts`.

### Backing up the database

**Safest method — SQLite online backup:**
```bash
sqlite3 data.db ".backup /backup/data.db.$(date +%Y%m%d_%H%M%S)"
```

**Simple file copy (stop the server first, or use WAL checkpoint):**
```bash
# Checkpoint WAL then copy
sqlite3 data.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp data.db /backup/data.db.$(date +%Y%m%d_%H%M%S)
```

**Automated daily backup with cron:**
```bash
# Add to crontab: crontab -e
0 2 * * * sqlite3 /home/ubuntu/affordable-mobile-mechanics-app/data.db ".backup /backup/amm/data.db.$(date +\%Y\%m\%d)" && find /backup/amm -mtime +30 -delete
```

---

## 7. Restoring from a Backup

### Restore the SQLite database

```bash
# Stop the server
sudo systemctl stop amm   # or: docker compose down

# Replace data.db with the backup copy
cp /backup/amm/data.db.20250601_020000 data.db
# Remove stale WAL files if present
rm -f data.db-shm data.db-wal

# Restart
sudo systemctl start amm
```

### Restore from source + database backup

```bash
# 1. Extract the source ZIP
unzip amm-self-hosting.zip
cd affordable-mobile-mechanics-app

# 2. Install and build
npm install
npm run build

# 3. Place your database backup
cp /path/to/backup/data.db ./data.db

# 4. Set environment
cp .env.example .env && nano .env

# 5. Start
npm start
```

All data (customers, jobs, invoices, staff, session history) is contained in `data.db`. The source code does not contain any business data — restoring the database file is sufficient to restore all application state.

---

## 8. Environment Variables Reference

See `.env.example` for a commented reference. Summary:

| Variable              | Required | Default    | Notes                                                                 |
|-----------------------|----------|------------|-----------------------------------------------------------------------|
| `NODE_ENV`            | Yes      | —          | Set to `production` in deployment                                     |
| `PORT`                | No       | `5000`     | HTTP listen port                                                      |
| `DATABASE_PATH`       | No       | `data.db`  | Absolute path for the SQLite file. **Required on Render** — set to a path inside the persistent disk mount (e.g. `/var/data/amm/data.db`). Parent directories are created automatically. Leave unset for local dev. |
| `TWILIO_ACCOUNT_SID`  | No       | —          | SMS via Twilio (leave blank to disable)                               |
| `TWILIO_AUTH_TOKEN`   | No       | —          | Twilio auth                                                           |
| `TWILIO_FROM_NUMBER`  | No       | —          | Twilio sender number (E.164 format)                                   |
| `ZOHO_MAIL_TOKEN`     | No       | —          | Zoho Mail API token for outbound email                                |
| `ZOHO_MAIL_FROM`      | No       | —          | Sender address for Zoho Mail                                          |
| `ZOHO_CRM_TOKEN`      | No       | —          | Zoho CRM OAuth token for customer sync                                |
| `ZOHO_BOOKS_TOKEN`    | No       | —          | Zoho Books token for invoice sync                                     |

Without any integration variables the app runs fully offline — messages are logged in the database with status `queued` rather than transmitted.

---

## 9. Zoho & Twilio Integration Activation

The backend stubs for both integrations are already wired in `server/routes.ts`. To activate them:

### Twilio (SMS)

1. Create a Twilio account at https://www.twilio.com
2. Obtain your Account SID and Auth Token from the Twilio Console.
3. Purchase a phone number (E.164 format, e.g. `+15551234567`).
4. Add to `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+15551234567
   ```
5. In `server/routes.ts`, inside the `POST /api/messaging/send` route, replace the `// TODO: actual Twilio call` comment with:
   ```ts
   import twilio from 'twilio';
   // ...
   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
   await client.messages.create({
     body: parsed.data.messageBody,
     from: process.env.TWILIO_FROM_NUMBER,
     to: parsed.data.toAddress,
   });
   ```
   Install the SDK: `npm install twilio @types/twilio`

### Zoho Mail

1. Create a Zoho Mail account and generate a mail API token in the Zoho Developer Console.
2. Add to `.env`:
   ```
   ZOHO_MAIL_TOKEN=your_zoho_mail_api_token
   ZOHO_MAIL_FROM=dispatch@yourdomain.com
   ```
3. Implement the actual send in the email branch of `POST /api/messaging/send` using the Zoho Mail API v1: `https://mail.zoho.com/api/accounts/{accountId}/messages`

### Zoho CRM / Books

The sync stubs at `POST /api/integrations/zoho/sync/customer/:id` and `/invoice/:id` return `{ synced: false }` unless `ZOHO_CRM_TOKEN` / `ZOHO_BOOKS_TOKEN` are set. Implement the actual API call by replacing the stub response with a fetch to the Zoho CRM v2 or Zoho Books v3 API using the token from the environment variable.

---

## 10. Domain and HTTPS

### Option A: Caddy (easiest — automatic TLS)

Install Caddy (https://caddyserver.com/docs/install), then create `/etc/caddy/Caddyfile`:

```caddyfile
yourdomain.com {
    reverse_proxy localhost:5000
}
```

Start Caddy:
```bash
sudo systemctl enable --now caddy
```

Caddy handles TLS certificate issuance (Let's Encrypt) and renewal automatically. It sets `X-Forwarded-Proto: https`, which the app reads to enable `SameSite=None; Secure` session cookies.

### Option B: nginx + Certbot

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Obtain certificate: `sudo certbot --nginx -d yourdomain.com`

### Session cookies and HTTPS

The app automatically detects HTTPS via the `X-Forwarded-Proto` header and upgrades session cookies to `SameSite=None; Secure`. This is required for the app to work correctly in embedded webviews and mobile browsers over HTTPS. No extra configuration is needed beyond ensuring your proxy forwards `X-Forwarded-Proto`.

---

## 11. Deploying on Render (with Persistent Disk)

Render's free-tier and starter web services use ephemeral filesystems — any file written outside a mounted persistent disk is lost on every redeploy. Follow these steps to run the app on Render with durable data.

### 11.1 Create a Web Service

1. Push your code to a GitHub/GitLab repo.
2. In the Render dashboard, click **New → Web Service** and connect the repo.
3. Set the following:
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.cjs`
   - **Instance type:** Starter (or higher)

### 11.2 Attach a Persistent Disk

1. In your web service settings, go to **Disks** and click **Add Disk**.
2. Configure the disk:
   - **Name:** `amm-data` (or any name)
   - **Mount Path:** `/var/data` (recommended)
   - **Size:** 1 GB is sufficient for most deployments
3. Save.

### 11.3 Set Environment Variables

In your Render service's **Environment** tab, add:

| Key              | Value                          |
|------------------|--------------------------------|
| `NODE_ENV`       | `production`                   |
| `DATABASE_PATH`  | `/var/data/amm/data.db`        |

The app will create the `/var/data/amm/` directory on first startup if it does not exist.

Add any optional integration variables (Twilio, Zoho) as needed.

### 11.4 First Deploy

Trigger a manual deploy or push a commit. Render builds the image, starts the service, and the SQLite database is created at `/var/data/amm/data.db` on the persistent disk. It will survive all future redeploys.

### 11.5 Seed the Database

After the service is live, seed the initial data:

```bash
curl -X POST https://your-app.onrender.com/api/seed
```

Then log in with `admin` / `admin123` and change the password immediately.

---

## 12. DATABASE_PATH — Controlling the Database Location

The SQLite database location is controlled by the `DATABASE_PATH` environment variable.

**Behaviour:**

- If `DATABASE_PATH` is **not set**, the database file defaults to `"data.db"` in the process working directory (safe for local development — no config needed).
- If `DATABASE_PATH` **is set**, the database is opened at that path. The server automatically creates any missing parent directories using `fs.mkdirSync(..., { recursive: true })` before opening the file.

**Implementation (already applied in `server/storage.ts`):**

```ts
const dbPath = process.env.DATABASE_PATH ?? "data.db";
const dbDir = path.dirname(dbPath);
if (dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const sqlite = new Database(dbPath);
```

**Example values:**

| Deployment target       | `DATABASE_PATH`                  |
|-------------------------|----------------------------------|
| Local dev (default)     | *(unset)*                        |
| Render persistent disk  | `/var/data/amm/data.db`          |
| Docker named volume     | `/app/data-volume/data.db`       |
| VPS custom path         | `/home/ubuntu/amm-data/data.db`  |

---

## 13. Default Credentials / First Login

On first run the database is empty. The app exposes a seed endpoint that creates initial data:

```bash
curl -X POST http://localhost:5000/api/seed
```

After seeding, the default admin credentials are:
- **Username:** `admin`
- **Password:** `admin123`

**Change the admin password immediately after your first login** via Settings → Team → edit the admin user.

If you restored a production database backup, use the credentials that were active at the time of the backup — seeding is not needed.

---

## 14. Troubleshooting

### "Cannot find module" after deployment

Run `npm install` before `npm start`. The `dist/index.cjs` bundle requires `node_modules` for native modules like `better-sqlite3`.

### Database locked / WAL errors

If the server crashed without checkpointing, stale WAL files may cause issues:
```bash
sqlite3 data.db "PRAGMA wal_checkpoint(TRUNCATE);"
# or simply delete the WAL files if the server is stopped:
rm -f data.db-shm data.db-wal
```

### Session cookies not persisting on mobile

Ensure the app is served over HTTPS with a proper TLS certificate. Mobile browsers reject `SameSite=None; Secure` cookies over HTTP. See [Section 10](#10-domain-and-https).

### Port already in use

Change the `PORT` env var or stop the conflicting process:
```bash
sudo lsof -i :5000
sudo kill -9 <PID>
```

### Build fails with TypeScript errors

Run `npm run check` first to see type errors, fix them, then `npm run build`.
