# OpenSelf — Deploy Guide (Hetzner + Coolify)

Last updated: 2026-03-12

---

## Overview

OpenSelf runs on a Hetzner Cloud VPS with Coolify as the deployment platform.
Coolify provides GitHub-based auto-deploys, SSL certificates, and a web management UI.
SQLite persists on a mounted volume — no external database needed.

| Component | Details |
|---|---|
| **Server** | Hetzner CX23 (2 vCPU, 4GB RAM, 40GB SSD) |
| **Location** | Helsinki (HEL1), datacenter hel1-dc2 |
| **OS** | Ubuntu 24.04 |
| **IP** | `89.167.111.236` |
| **Platform** | Coolify 4.0.0-beta.463 (self-hosted PaaS) |
| **Domain** | openself.dev (registered on Porkbun) |
| **Build** | Multi-stage Dockerfile (Node 20 Alpine) |
| **Cost** | ~€3.65/month (server only) |

---

## 1. Server Setup (Hetzner)

### 1.1 Create an account

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click **"Register"** (top right)
3. Sign up with email and password
4. Confirm the email
5. Add a payment method (credit card or PayPal — nothing is charged until you create a server)

### 1.2 Check your SSH key

Before creating the server, you need an SSH key. On your local machine, run:

```bash
cat ~/.ssh/id_ed25519.pub
```

- If it prints a string starting with `ssh-ed25519`, you have a key. Copy the whole line.
- If it says "file not found", generate one:
  ```bash
  ssh-keygen -t ed25519 -C "your-email@example.com"
  ```
  Then run the `cat` command again and copy the output.

### 1.3 Create the server

1. In the Hetzner Cloud Console, click **"Add Server"**
2. Configure:
   - **Location**: Helsinki (HEL1) — or Falkenstein (FSN1) if available
   - **Image**: Ubuntu 24.04
   - **Type**: Shared vCPU → x86 (Intel/AMD) → **CX23** (2 vCPU, 4GB RAM, 40GB SSD — €3.65/mo)
   - **Networking**: leave defaults (Public IPv4 + IPv6)
   - **SSH Key**: click "Add SSH key", paste your public key from step 1.2, give it a name (e.g., "my-laptop")
   - **Name**: `openself` (or any name you like)
   - **Everything else**: leave defaults (no Volumes, no Firewalls, no Backups)
3. Click **"Create & Buy Now"**
4. Wait ~30 seconds. Hetzner shows you the **public IP address** (e.g., `89.167.111.236`). Save this — you'll need it everywhere.

### 1.4 Connect via SSH

Open a terminal on your local machine:

```bash
ssh root@89.167.111.236
```

First time it asks to confirm the connection — type `yes` and press Enter.
You should see the Ubuntu welcome screen. You're inside the server.

---

## 2. Coolify Installation

### 2.1 Install Coolify

While connected via SSH to the server, run this single command:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This installs Docker, Coolify, and all dependencies. Takes 2-3 minutes.
When done, you see a message like:

```
Your instance is ready to use!
You can access Coolify through your Public IPV4: http://89.167.111.236:8000
```

### 2.2 Important: backup the Coolify environment file

The installer warns about this. Save this file somewhere safe (password manager, etc.):

```bash
cat /data/coolify/source/.env
```

### 2.3 Initial setup in browser

1. Open `http://89.167.111.236:8000` in your browser
2. Coolify asks you to **create an admin account** — pick an email and password. This is only for Coolify, not related to Hetzner.
3. Setup wizard step 1 — **"Choose Server Type"**: select **"This Machine"** (Coolify is already on this server, so we deploy here)
4. Setup wizard step 2 — **"Project Setup"**: click **"Create My First Project"**
5. You're now in the Coolify dashboard.

---

## 3. Deploy OpenSelf

### 3.1 Add the application

1. In the Coolify dashboard, click **"+ Add Resource"** (or "New Resource")
2. Under **Applications → Git Based**, choose **"Public Repository"**
3. Fill in:
   - **Repository URL**: `https://github.com/tommy29tmar/openself`
   - **Branch**: `main`
   - **Build Pack**: change from "Nixpacks" to **"Dockerfile"** (important!)
   - **Base Directory**: `/`
   - **Port**: `3000`
   - **Is it a static site?**: No
4. Click **"Continue"**

You're now on the application Configuration page.

### 3.2 Clean up defaults

Coolify sets some defaults for Laravel/PHP apps. Remove them:

- Scroll down to **Pre/Post Deployment Commands**
- **Pre-deployment**: delete `php artisan migrate` (leave empty)
- **Post-deployment**: delete `php artisan migrate` (leave empty)

### 3.3 Add environment variables

In the left sidebar, click **"Environment Variables"**.

Add these variables (click "New Environment Variable" for each):

**Variable 1 — Choose your AI provider:**
- **Name**: `AI_PROVIDER`
- **Value**: `anthropic` or `openai` or `google` or `ollama`
- **Available at Runtime**: must be checked
- Click **Save**

**Variable 2 — API key for your chosen provider:**

| Provider | Variable Name | Value |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `sk-ant-...` ([console.anthropic.com](https://console.anthropic.com)) |
| OpenAI | `OPENAI_API_KEY` | `sk-proj-...` ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)) |
| Google | `GOOGLE_API_KEY` | `AI...` ([aistudio.google.dev](https://aistudio.google.dev)) |
| Ollama | `OLLAMA_BASE_URL` | `http://localhost:11434` (no API key needed) |

- **Available at Runtime**: must be checked
- Click **Save**

> **Tip:** You can add API keys for multiple providers at the same time. Only the one
> matching `AI_PROVIDER` will be used. To switch providers, just change `AI_PROVIDER`
> and redeploy — no need to remove the other keys.

**Multi-user access control (recommended for hosted deployments):**

| Name | Value | Notes |
|---|---|---|
| `INVITE_CODES` | `alpha1,alpha2,alpha3` | Comma-separated list of valid invite codes. When set, visitors must enter a code at `/invite` to access `/builder`. When **not** set, the app runs in single-user mode with no gate (backward-compatible). |
| `CHAT_MESSAGE_LIMIT` | `10` | Max user messages per session before the registration prompt appears. Default: `10`. Only applies when `INVITE_CODES` is set. |

**Authentication & user accounts:**

| Name | Value | Notes |
|---|---|---|
| `AUTH_V2` | `true` | Enables email+password signup/login. When `false` (default), registration accepts only username (legacy mode). |
| `PROFILE_ID_CANONICAL` | `true` | Uses `profile_id` as the sole data key (no `session_id` fallback). Enable after confirming all data has been backfilled. |
| `NEXT_PUBLIC_BASE_URL` | `https://openself.dev` | Required for OAuth callback URLs. Must match your public domain. |

**OAuth login (optional — buttons appear only when configured):**

| Name | Value | How to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `123...apps.googleusercontent.com` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth 2.0 Client ID. Authorized redirect URI: `https://openself.dev/api/auth/google/callback` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Same page as above |
| `GITHUB_CLIENT_ID` | `Iv1.abc123...` | [GitHub Developer Settings](https://github.com/settings/developers) → New OAuth App. Authorization callback URL: `https://openself.dev/api/auth/github/callback` |
| `GITHUB_CLIENT_SECRET` | `ghp_...` | Same page as above |
| `DISCORD_CLIENT_ID` | `123456789...` | [Discord Developer Portal](https://discord.com/developers/applications) → New Application → OAuth2. Redirect: `https://openself.dev/api/auth/discord/callback` |
| `DISCORD_CLIENT_SECRET` | `...` | Same page as above |
| `LINKEDIN_CLIENT_ID` | `...` | [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) → Create App → Auth tab. Redirect: `https://openself.dev/api/auth/linkedin/callback`. Requires "Sign In with LinkedIn using OpenID Connect" product. |
| `LINKEDIN_CLIENT_SECRET` | `...` | Same page as above |
| `TWITTER_CLIENT_ID` | `...` | [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard) → Project → App → Keys. OAuth 2.0 callback: `https://openself.dev/api/auth/twitter/callback`. Requires OAuth 2.0 enabled. Note: Twitter does not provide email — a placeholder is used. |
| `TWITTER_CLIENT_SECRET` | `...` | Same page as above |
| `APPLE_CLIENT_ID` | `com.example.app` | [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId) → Services IDs → Create. Redirect: `https://openself.dev/api/auth/apple/callback`. Requires Apple Developer account ($99/year). |
| `APPLE_TEAM_ID` | `XXXXXXXXXX` | 10-character Team ID from Apple Developer Account → Membership |
| `APPLE_KEY_ID` | `XXXXXXXXXX` | [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) → Keys → Create Key with "Sign in with Apple" |
| `APPLE_PRIVATE_KEY` | `base64...` | Download the `.p8` key file, then encode: `base64 -w0 AuthKey_XXXXXXXXXX.p8` |

> **Note:** OAuth buttons on `/login` and `/signup` appear **only for configured providers**.
> The server-side `getConfiguredProviders()` function (`src/lib/auth/providers.ts`) checks
> that all required env vars are set before rendering a provider button. If no OAuth
> provider is configured, only the email+password form is shown (no divider, no OAuth section).
> Each provider is independent: configure only the ones you need.
> If no OAuth provider is configured, users can still sign up with email+password (when `AUTH_V2=true`).

**Connectors (data sources — GitHub, LinkedIn, RSS, Spotify, Strava):**

| Name | Value | How to get it |
|---|---|---|
| `CONNECTOR_ENCRYPTION_KEY` | 64 hex chars | Generate: `openssl rand -hex 32`. Used for AES-256-GCM encryption of OAuth tokens stored in SQLite. |
| `GITHUB_CLIENT_ID` | `Ov23li...` | Same OAuth App used for login (see OAuth section above). The connector reuses the same app with a subdirectory callback: `https://openself.dev/api/auth/github/callback/connector` |
| `GITHUB_CLIENT_SECRET` | `999219f...` | Same OAuth App as above |
| `SPOTIFY_CLIENT_ID` | `669bfe...` | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Create App. Redirect URI: `https://openself.dev/api/auth/spotify/callback/connector` |
| `SPOTIFY_CLIENT_SECRET` | `4f8c42...` | Same app as above → Settings → View client secret |
| `STRAVA_CLIENT_ID` | `210853` | [Strava API Settings](https://www.strava.com/settings/api) → Create App. Authorization Callback Domain: `openself.dev` |
| `STRAVA_CLIENT_SECRET` | `079327...` | Same page as above |

> **Notes:**
> - `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are shared between login OAuth and the GitHub connector.
>   The connector callback URL (`/api/auth/github/callback/connector`) is a subdirectory of the login callback
>   (`/api/auth/github/callback`), which GitHub validates automatically.
> - LinkedIn ZIP import requires no additional env vars — it's a file upload connector.
> - RSS connector requires no env vars — it uses URL input (no OAuth).
> - Spotify and Strava env vars must be set on **both** the Web App and Worker services.
> - All connector env vars must be set at **runtime** (check "Available at Runtime" in Coolify).

Optional cost guardrails (recommended):

| Name | Value |
|---|---|
| `LLM_DAILY_TOKEN_LIMIT` | `500000` |
| `LLM_DAILY_COST_WARNING_USD` | `1` |
| `LLM_DAILY_COST_HARD_LIMIT_USD` | `2` |
| `LLM_HARD_STOP` | `true` |

### 3.4 Add persistent storage (SQLite volume)

**⚠ CRITICAL: Without this step, the database is destroyed on every redeploy.**

The SQLite file lives inside the container at `/app/db/`. By default, Docker containers
are ephemeral — when Coolify rebuilds and replaces the container, everything inside it
is lost. A persistent volume mounts a folder from the server's real disk into the
container, so the database survives across deploys.

**Step 1 — Create the host directory with correct permissions:**

SSH into the server and run:

```bash
ssh root@89.167.111.236
mkdir -p /data/openself/db
chown -R 1001:1001 /data/openself/db
```

The `1001:1001` owner matches the `nextjs` user inside the container (defined in the
Dockerfile). Without this, the container cannot write to the mounted folder.

**Step 2 — Add the volume in Coolify:**

1. In the left sidebar, click **"Persistent Storage"**
2. Click **"+ Add"** to open the "Add Volume Mount" dialog
3. Fill in:
   - **Name**: `openself-db`
   - **Source Path**: `/data/openself/db`
   - **Destination Path**: `/app/db`
4. Click **"Add"**

**Step 3 — Verify after first deploy:**

After deploying, confirm the database file exists on the host:

```bash
ssh root@89.167.111.236 "ls -la /data/openself/db/"
```

You should see `openself.db` (or similar `.sqlite` file). If the directory is empty,
the volume mount is not working — check Coolify's Persistent Storage tab.

### 3.5 First deploy

Click the **"Deploy"** button (top of the page).

Coolify will:
1. Clone the repository from GitHub
2. Build the Docker image using the Dockerfile (takes ~2 min)
3. Start the container

You can watch progress in the **"Deployments"** tab.

### 3.6 Verify

When the deployment finishes, Coolify gives you a temporary URL like:
```
http://cokksgw48goscs8okgk48okw.89.167.111.236.sslip.io
```

Open it in the browser. You should see the OpenSelf homepage with "Create your page" button.

### 3.7 Post-deploy chat persistence smoke test

Run this quick regression test after each deploy (especially frontend changes):

1. Open `/builder` on a mobile viewport (real phone or browser device emulation)
2. Send 1-2 messages in chat
3. Switch tab `Chat → Preview → Chat`
4. Confirm previous messages are still visible (no reset to only welcome message)
5. Refresh the page
6. Confirm chat history is restored from DB (via `GET /api/messages`)

Expected result:
- tab switches do not clear chat
- refresh restores prior messages

---

## 4. Custom Domain (Porkbun → openself.dev)

### 4.1 DNS configuration on Porkbun

1. Go to [porkbun.com](https://porkbun.com) and log in
2. Click **"Domain Management"**
3. Find `openself.dev` and click **"DNS"** (or "Details" → "DNS")
4. You'll see the **"MANAGE DNS RECORDS"** popup

**First: delete existing parking records.**

Porkbun adds default records that point to their parking page. In the "Current Records" list at the bottom, find and **delete**:
- `ALIAS openself.dev → pixie.porkbun.com`
- `CNAME *.openself.dev → pixie.porkbun.com`

Click the delete icon next to each one.

**Then: add two new A records.**

**Record 1 (root domain — openself.dev):**
- **Type**: `A - Address record`
- **Host**: leave **completely empty** (this means the root domain)
- **Answer / Value**: `89.167.111.236`
- **TTL**: `600`
- Click **Add**

**Record 2 (www subdomain — www.openself.dev):**
- **Type**: `A - Address record`
- **Host**: `www`
- **Answer / Value**: `89.167.111.236`
- **TTL**: `600`
- Click **Add**

After adding both, the "Current Records" list should show:

| Type | Host | Answer |
|---|---|---|
| A | openself.dev | 89.167.111.236 |
| A | www.openself.dev | 89.167.111.236 |

### 4.2 Configure domain in Coolify

1. Go to Coolify (`http://89.167.111.236:8000`)
2. Open your application → **Configuration** → **General**
3. Find the **Domains** field
4. Replace the existing sslip.io URL with:
   ```
   https://openself.dev,https://www.openself.dev
   ```
5. Click **Save** (or **Redeploy** if Save is not visible)

Coolify automatically provisions SSL certificates via Let's Encrypt.

### 4.3 Wait for DNS propagation + SSL

- DNS propagation takes **5-30 minutes** (sometimes up to 1 hour)
- SSL certificate generation takes **2-5 minutes** after DNS is propagated
- During this time you may see "connection not private" errors — this is normal
- After everything propagates, `https://openself.dev` will show a green padlock and load the app

### 4.4 Verify

Open **https://openself.dev** in your browser. You should see:
- Green padlock (HTTPS working)
- OpenSelf homepage

If you still see certificate errors after 30 minutes, try:
1. In Coolify, go to your app → Deployments → click **Redeploy**
2. Check Coolify logs for certificate-related errors
3. Verify DNS with: `dig openself.dev` (should show `89.167.111.236`)

---

## 5. Ongoing Operations

### 5.1 Deploying updates

Every time you push code to GitHub (`git push origin main`), you need to deploy:

**Option A — Manual deploy (current setup):**
1. Go to Coolify → your app
2. Click **"Deploy"** or **"Redeploy"**
3. Coolify pulls the latest code from GitHub and rebuilds

**Option B — API deploy (current setup):**

Requires a Coolify API token with `deploy` permission (stored in `.env`).

```bash
curl -s \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false"
```

The `.env` file contains the three variables: `COOLIFY_API_TOKEN`, `COOLIFY_APP_UUID`, `COOLIFY_BASE_URL`.

**Option C — Auto-deploy via GitHub webhook:**
1. In Coolify, go to your app → **Webhooks** (left sidebar)
2. Copy the webhook URL
3. In GitHub, go to your repo → Settings → Webhooks → Add webhook
4. Paste the Coolify webhook URL
5. Now every `git push` triggers an automatic deploy

### 5.2 Checking logs

**In Coolify:**
Application → **Logs** tab → shows container output in real-time.

**Via SSH:**
```bash
ssh root@89.167.111.236
docker ps                              # find the container name
docker logs <container_name> --tail 100 -f   # follow logs
```

### 5.3 Database backup

The SQLite database lives on the server at:
```
/data/openself/db/openself.db
```

To create a manual backup:
```bash
ssh root@89.167.111.236
mkdir -p /root/backups
cp /data/openself/db/openself.db /root/backups/openself-$(date +%Y%m%d).db
```

To download a backup to your local machine:
```bash
scp root@89.167.111.236:/data/openself/db/openself.db ./openself-backup.db
```

### 5.4 Quick access reference

| What | Where |
|---|---|
| Live site | https://openself.dev |
| Coolify admin panel | http://89.167.111.236:8000 |
| SSH into server | `ssh root@89.167.111.236` |
| Server provider | [Hetzner Cloud Console](https://console.hetzner.cloud) |
| Domain DNS | [Porkbun DNS](https://porkbun.com/account/domainsSpeedy) |
| GitHub repo | https://github.com/tommy29tmar/openself |
| Anthropic API keys | https://console.anthropic.com |
| OpenAI API keys | https://platform.openai.com/api-keys |
| Google AI Studio | https://aistudio.google.dev |

---

## 6. Voice / STT Service

OpenSelf supports voice input via a self-hosted faster-whisper container. The STT
(Speech-to-Text) service runs as a separate Coolify application on the same Docker
network, reachable internally by the web app.

### 6.1 Coolify app details

| Key | Value |
|---|---|
| App UUID | `cwk80s40cgks4kkog04swgkc` |
| Source repo | `https://github.com/tommy29tmar/openself` (branch: main) |
| Base directory | `/docker/stt` |
| Dockerfile | `/Dockerfile` (relative to base directory) |
| Port | `8080` (internal only — no public domain needed) |

### 6.2 Environment variables (STT service)

| Variable | Value | Description |
|---|---|---|
| `WHISPER_MODEL` | `tiny` | Model size (tiny/base/small/medium/large) |
| `WHISPER_COMPUTE_TYPE` | `int8` | Quantization for CPU inference |
| `WHISPER_DEVICE` | `cpu` | Compute device (cpu/cuda) |
| `MAX_AUDIO_DURATION` | `60` | Max audio length in seconds |
| `MODEL_DIR` | `/models/whisper` | Persistent model cache directory |

### 6.3 Environment variables (web app — voice)

These must be added to the **web app** (not the STT service):

| Variable | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_VOICE_ENABLED` | `true` | Master switch for voice UI (build-time) |
| `NEXT_PUBLIC_VOICE_STT_SERVER_FALLBACK_ENABLED` | `true` | Enable server STT fallback path (build-time) |
| `VOICE_STT_SERVER_FALLBACK_ENABLED` | `true` | Server-side gate for `/api/transcribe` |
| `STT_SERVICE_URL` | `http://openself-stt:8080` | Internal URL to STT container |

> **Important:** `NEXT_PUBLIC_*` vars are baked at build time — changing them requires a
> rebuild (redeploy), not just a restart.

### 6.4 Persistent storage (whisper models)

The whisper model is downloaded on first request and cached. To persist across deploys:

1. Create the host directory:
   ```bash
   ssh root@89.167.111.236
   mkdir -p /data/openself/models
   chmod 777 /data/openself/models
   ```

2. In Coolify, set **Custom Docker Run Options** for the STT app:
   ```
   -v /data/openself/models:/models/whisper --network-alias=openself-stt
   ```

### 6.5 Network alias (post-deploy step)

Coolify gives containers names like `{uuid}-{timestamp}` that change on every deploy.
To maintain a stable DNS name (`openself-stt`) on the `coolify` Docker network, run
the alias script after each STT redeploy:

```bash
ssh root@89.167.111.236 /data/openself/fix-stt-alias.sh
```

The script disconnects/reconnects the STT container to the `coolify` network with
the `openself-stt` alias. This is needed because Coolify does not natively support
persistent network aliases for standalone applications.

### 6.6 Verification

```bash
# Health check (from local machine)
curl https://openself.dev/api/transcribe/health
# Expected: {"available":true}

# Direct STT health (from server)
ssh root@89.167.111.236 "docker exec <web-container> wget -qO- http://openself-stt:8080/health"
# Expected: {"status":"ok","model":"tiny"}
```

### 6.7 How voice works

- **Primary path:** Browser Web Speech API (Chrome/Safari) — no server needed
- **Fallback path:** MediaRecorder → POST `/api/transcribe` → proxy to STT container
- **TTS:** Browser SpeechSynthesis API (no server needed)
- **Feature flags:** All gated via `NEXT_PUBLIC_VOICE_ENABLED`

---

## 7. Architecture Diagram

```
User browser
     │
     ▼
openself.dev (DNS → 89.167.111.236)
     │
     ▼
Hetzner CX23 server (Helsinki, €3.65/mo)
├── Coolify (port 8000)
│   ├── Reverse proxy (Traefik) → routes traffic to containers
│   ├── SSL certificates (Let's Encrypt, auto-renewed)
│   └── Management UI (deploys, logs, env vars)
│
├── OpenSelf web container (port 3000)
│   ├── Next.js standalone server (server.js)
│   ├── SQLite database at /app/db/openself.db
│   │   └── Volume-mounted to /data/openself/db/ on host
│   ├── /api/transcribe → proxies to STT container
│   └── LLM API key loaded from environment variables
│
├── OpenSelf worker container (no HTTP port)
│   ├── Background job processor (heartbeat, summaries)
│   └── Shares SQLite volume with web container
│
└── STT container "openself-stt" (port 8080, internal only)
    ├── Python FastAPI + faster-whisper (tiny model, int8)
    ├── /health → health check
    ├── /transcribe → audio file → text
    └── Volume-mounted to /data/openself/models/ on host (model cache)
```

### Docker build stages (what happens during deploy)

1. **deps** stage: Installs node_modules + compiles better-sqlite3 (native C++ module, needs python3/g++/make)
2. **build** stage: Copies source code, runs `next build` with `output: "standalone"` → creates minimal server
3. **runtime** stage: Clean Alpine image (~200MB), copies only server.js, static assets, and migration SQL files

---

## 8. Worker Process

OpenSelf includes a background worker process for async jobs (heartbeat, summary generation, etc.). In production, it runs as a separate service alongside the web process.

### Build

The worker is built with tsup (bundled in devDependencies):

```bash
npm run worker:build
# Output: dist/worker.js (CJS, ~80KB)
```

### Health Check

Verify the worker can connect to the DB and all handlers are registered:

```bash
npm run worker:check
# Runs: node dist/worker.js --health-check
# Exit 0 = healthy, Exit 1 = error
```

### Environment Variables

The worker needs the same database path as the web process, plus:

| Variable | Value | Description |
|---|---|---|
| `DB_BOOTSTRAP_MODE` | `follower` | Worker waits for web (leader) to run migrations |

The web process should have `DB_BOOTSTRAP_MODE=leader` (this is the default if not set).

### Coolify Deployment

To run the worker as a second service in Coolify:

1. Create a new service in Coolify pointing to the same repository
2. Set the **Build command** to: `npm ci && npm run build && npm run worker:build`
3. Set the **Start command** to: `node dist/worker.js`
4. Add environment variable: `DB_BOOTSTRAP_MODE=follower`
5. Mount the same SQLite volume as the web service (`/data/openself/db` → `/app/db`)
6. The worker will poll `schema_meta` until the web process runs migrations, then start processing jobs

**Pre-provisioned Coolify app (not yet deployed):**

| Key | Value |
|---|---|
| App UUID | `y4o0k84wcko0co0c0gcw84ws` |
| Source repo | `https://github.com/tommy29tmar/openself` (public, branch: main) |
| Port (placeholder) | 3001 |
| Status | Created via API, needs Dockerfile + env vars + volume mount before first deploy |

Remaining setup before deploy:
- Create a dedicated `Dockerfile.worker` (or set Dockerfile path to reuse multi-stage build with worker target)
- Set env vars via API: `DB_BOOTSTRAP_MODE=follower`, same LLM keys as web app
- Mount shared SQLite volume (`/data/openself/db` → `/app/db`)
- Disable domain/SSL (worker has no HTTP endpoints, only health-check)

### Local Development

Run the worker alongside the dev server:

```bash
# Terminal 1: web
npm run dev

# Terminal 2: worker
npm run worker:dev
# Uses tsx watch for hot reload
```

---

## 9. Connectors Setup

OpenSelf supports 5 data source connectors. Each pulls data from an external service, creates semantic facts (Tier 1 memory) and episodic events (Tier 4 memory).

| Connector | Auth Type | Env Vars Required | User Limit | Token Expiry |
|---|---|---|---|---|
| **GitHub** | OAuth | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Unlimited | No expiry |
| **LinkedIn** | ZIP upload | None | N/A | N/A |
| **RSS** | URL input | None | N/A | N/A |
| **Spotify** | OAuth | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | **25 in dev mode** | 1 hour (auto-refresh) |
| **Strava** | OAuth | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | **Varies (default ~10-15)** | 6 hours (auto-refresh) |

All connectors also require `CONNECTOR_ENCRYPTION_KEY` (shared, AES-256-GCM) and `NEXT_PUBLIC_BASE_URL=https://openself.dev`.

### 9.1 GitHub Connector

Already configured as part of login OAuth. No additional setup needed — the connector reuses the same OAuth app with callback `https://openself.dev/api/auth/github/callback/connector`.

### 9.2 LinkedIn Connector

No configuration needed. Users upload a LinkedIn ZIP export directly in the UI.

### 9.3 RSS Connector

No configuration needed. Users paste a feed URL in the ConnectorCard UI. Supported formats: RSS 2.0, Atom 1.0. SSRF protection validates all URLs before fetching.

### 9.4 Spotify Connector

**Step 1 — Create app on Spotify Developer Dashboard:**

1. Go to **https://developer.spotify.com/dashboard**
2. Log in with your Spotify account
3. Click **"Create app"**
4. Fill in:
   - **App name**: `OpenSelf`
   - **App description**: `Personal page builder — music taste integration`
   - **Redirect URI**: `https://openself.dev/api/auth/spotify/callback/connector`
   - **Which API/SDKs**: select **Web API**
5. Accept Terms → **Save**

**Step 2 — Copy credentials:**

1. In the app dashboard → **Settings**
2. Copy **Client ID** and **Client Secret** (click "View client secret")

**Step 3 — Add to Coolify (both Web App + Worker):**

```
SPOTIFY_CLIENT_ID=<your client id>
SPOTIFY_CLIENT_SECRET=<your client secret>
```

**Step 4 — Redeploy** both Web App and Worker.

**Current app credentials:**

| Field | Value |
|---|---|
| Client ID | `669bfe104d564417a07f0a43bf4802de` |
| Client Secret | `4f8c428e92684f369332a4345bb75c6d` |
| Redirect URI | `https://openself.dev/api/auth/spotify/callback/connector` |
| Scopes | `user-top-read`, `user-read-recently-played` |
| Dashboard | https://developer.spotify.com/dashboard |

**Development Mode limits:**

- Spotify apps start in **Development Mode** with a **25-user limit** (only manually added users can authenticate)
- To add users: Dashboard → your app → **User Management** → add Spotify email addresses
- To remove the limit: Dashboard → your app → **Extension Request** (takes ~1 week review by Spotify)
- Extension Request requires: app description, screenshots, privacy policy URL
- Until approved, only users listed in User Management can connect

**What it syncs:**

- Top artists (short/medium/long term) → `interest/music` facts
- Top tracks → `interest/music` facts
- Music genres → `interest/music` facts
- Taste shift detection: if ≥3 of top-5 artists change between syncs → episodic event

### 9.5 Strava Connector

**Step 1 — Create app on Strava:**

1. Go to **https://www.strava.com/settings/api**
2. Log in with your Strava account
3. Fill in:
   - **Application Name**: `OpenSelf`
   - **Category**: `Social`
   - **Website**: `https://openself.dev`
   - **Authorization Callback Domain**: `openself.dev`
   - **Description**: `Personal page builder — fitness data integration`
4. Accept terms → **Create**

**Step 2 — Copy credentials** from the same page (Client ID is numeric, Client Secret is a hex string).

**Step 3 — Add to Coolify (both Web App + Worker):**

```
STRAVA_CLIENT_ID=<your client id>
STRAVA_CLIENT_SECRET=<your client secret>
```

**Step 4 — Redeploy** both Web App and Worker.

**Current app credentials:**

| Field | Value |
|---|---|
| Client ID | `210853` |
| Client Secret | `079327e70dbe0c394cdbfdae7ea3a8781d6dc537` |
| Callback Domain | `openself.dev` |
| Redirect URI (built at runtime) | `https://openself.dev/api/auth/strava/callback/connector` |
| Scopes | `read`, `activity:read_all` |
| Settings page | https://www.strava.com/settings/api |

**Strava API limits:**

- **Rate limits**: 200 requests/15 minutes, 2000 requests/day (read: 100/15min, 1000/day)
- **Athlete limit**: starts at ~10-15 athletes. To increase, contact api-support@strava.com with app details.
- No formal review process like Spotify — just email Strava support

**What it syncs:**

- Athlete profile → `sport/fitness` facts
- Activities (runs, rides, swims, etc.) → `sport/fitness` facts (max 1000 activities per sync)
- Aggregate stats → `sport/fitness` facts
- Workout events → episodic events (`actionType: "workout"`)
- PR milestones → episodic events (`actionType: "milestone"`)
- Incremental sync via `syncCursor` (unix timestamp of last activity)

### 9.6 Connector sync behavior

- **First sync (baseline)**: Creates facts only, NO episodic events. Seeds dedup entries in `connector_items` table.
- **Subsequent syncs**: Creates/updates facts AND generates episodic events for new items.
- **Automatic sync**: Worker runs a daily connector sync loop (separate from heartbeat). Each connector syncs at most once per calendar day (owner timezone).
- **Manual sync**: Users can trigger sync via the ConnectorCard "Sync" button (rate-limited to 1/hour).
- **Token refresh**: OAuth tokens auto-refresh on 401 errors via `withTokenRefresh()` wrapper. Spotify tokens expire every 1 hour, Strava every 6 hours.
- **Dream Cycle isolation**: Only `source='chat'` events trigger habit pattern proposals. Connector events are excluded to prevent noise.

---

## 10. Troubleshooting

| Problem | Solution |
|---|---|
| Build fails on better-sqlite3 | The Dockerfile already handles this (`apk add python3 make g++`). If it still fails, check Docker build logs in Coolify. |
| Database empty after deploy | **Most common cause**: Persistent Storage not configured in Coolify. Go to Coolify → Persistent Storage → verify the volume `openself-db` exists (Source `/data/openself/db` → Destination `/app/db`). Also check that the host directory exists and has correct permissions: `ssh root@89.167.111.236 "ls -la /data/openself/db/"` — it should be owned by `1001:1001`. If the directory doesn't exist, create it: `mkdir -p /data/openself/db && chown -R 1001:1001 /data/openself/db`. |
| Chat resets when switching `Chat ↔ Preview` on mobile | Usually a stale frontend build running without the tab persistence fix (`forceMount` + `data-[state=inactive]:hidden` on mobile `TabsContent`). Redeploy the latest commit and hard refresh browser cache. |
| Chat resets after browser refresh | Check browser Network tab: `GET /api/messages` must return `200` and a `messages` array. If it returns `401`, session/auth is invalid (re-enter invite/login). If it returns `200` but empty unexpectedly, verify SQLite persistence (`/app/db` volume mount) and query stored `messages` in DB. |
| SSL "connection not private" error | Wait 5-30 minutes for DNS propagation and SSL generation. If it persists, redeploy in Coolify. Check DNS with `dig openself.dev`. |
| Container keeps restarting | Go to Coolify → Logs tab. Look for errors. Common cause: missing environment variables (AI_PROVIDER, ANTHROPIC_API_KEY). |
| Coolify panel unreachable | SSH into server (`ssh root@89.167.111.236`), run `docker ps` to check if Coolify containers are running. Restart with `docker restart coolify`. |
| "Cannot find module" during build | Clear the build cache in Coolify (Danger Zone → Clean Build Cache) and redeploy. |
| Forgot Coolify admin password | SSH into server, check `/data/coolify/source/.env` for reset options. |
| Need to change API key | Coolify → Environment Variables → edit the relevant key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) → Save → Redeploy. |
| Need to switch AI provider | Coolify → Environment Variables → change `AI_PROVIDER` to the new provider (e.g., `openai`), add the corresponding API key if not already present → Save → Redeploy. |
| OAuth login not working | Verify that both `*_CLIENT_ID` and `*_CLIENT_SECRET` are set for the provider. Check that `NEXT_PUBLIC_BASE_URL` matches your domain exactly (e.g., `https://openself.dev`). Verify the callback URL in the provider's console matches `https://openself.dev/api/auth/{provider}/callback`. |
| "OAuth sign-in failed" on login page | Check Coolify → Logs for `[google-oauth]` or `[github-oauth]` errors. Common causes: expired client secret, wrong callback URL, missing email permission scope. |
| Worker not processing jobs | Check `DB_BOOTSTRAP_MODE=follower` is set. Check logs for "Schema not ready" errors. Verify the web process has `DB_BOOTSTRAP_MODE=leader` and has started successfully. |
| Voice/STT not working | 1. Check `curl https://openself.dev/api/transcribe/health` returns `{"available":true}`. 2. If false, SSH in and run `/data/openself/fix-stt-alias.sh` (re-adds network alias after STT redeploy). 3. Check STT container is running: `docker ps | grep cwk80`. 4. Check web → STT connectivity: `docker exec <web-container> wget -qO- http://openself-stt:8080/health`. |
| Spotify "Connect" button shows "Not Configured" | `SPOTIFY_CLIENT_ID` and/or `SPOTIFY_CLIENT_SECRET` not set. Add to both Web App + Worker env vars in Coolify, redeploy both. |
| Spotify OAuth "invalid redirect" | Verify the Redirect URI in Spotify Dashboard matches exactly: `https://openself.dev/api/auth/spotify/callback/connector`. No trailing slash. |
| Spotify "User not registered" error | App is in Development Mode (25-user limit). Add the user's Spotify email in Dashboard → User Management. |
| Strava "Connect" button shows "Not Configured" | `STRAVA_CLIENT_ID` and/or `STRAVA_CLIENT_SECRET` not set. Add to both Web App + Worker env vars in Coolify, redeploy both. |
| Strava OAuth "invalid redirect" | Verify Authorization Callback Domain in Strava API Settings is exactly `openself.dev` (no https://, no path). |
| Connector sync not running automatically | Check Worker logs for "connector sync" entries. Verify connector status is 'connected' or 'error' and `enabled=1` in DB. Sync runs once per day per connector (owner timezone). |
| Connector shows "error" status | Check Worker logs for the specific error. Common: expired token (auto-refresh failed), API rate limit, network issue. Retry via manual sync button. |

---

## 11. Key Files in the Repository

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage production build (3 stages: deps → build → runtime) |
| `.dockerignore` | Excludes node_modules, .next, .env, tests, docs from Docker build context |
| `docker-compose.yml` | For local testing with `docker compose up` (maps ./data to /app/db) |
| `docker-compose.dev.yml` | Local dev STT service (`docker compose -f docker-compose.dev.yml up`) |
| `docker/stt/Dockerfile` | Faster-whisper STT service (Python 3.11, FastAPI) |
| `docker/stt/server.py` | STT server with `/health` and `/transcribe` endpoints |
| `next.config.ts` | `output: "standalone"` enables minimal Docker-optimized server. `optimizePackageImports: ["radix-ui"]` fixes SSR prerendering errors caused by radix-ui barrel imports. |
| `db/migrations/*.sql` | SQL migration files, auto-applied when the app starts |
| `src/lib/db/index.ts` | Database initialization + auto-migration on import |
| `src/lib/db/migrate.ts` | Migration runner (reads SQL files from db/migrations/) |

---

## 12. Cost Summary

| Item | Cost | Notes |
|---|---|---|
| Hetzner CX23 | €3.65/month | Server (2 vCPU, 4GB RAM, 40GB SSD) |
| Coolify | €0 | Open-source, self-hosted |
| Let's Encrypt SSL | €0 | Auto-renewed by Coolify |
| Porkbun domain | ~€12/year | openself.dev renewal |
| LLM API | Pay-per-use | Depends on provider: Anthropic Haiku ~$0.25/1M input, OpenAI GPT-4o ~$2.50/1M input |
| **Total fixed** | **~€4.65/month** | Server + domain |
