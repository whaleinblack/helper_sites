# `/mountain` HTTP-only deployment

This directory upgrades the existing `https://chufa.wang/mountain/` deployment from manual file copies to an auditable HTTPS/OIDC release flow. It does not create `/outdoor` or change the public URL.

## Verified existing service

Server inspection on 2026-10-14 confirmed:

- `/mountain/` is served by Nginx from `/srv/helper_sites/sites/osaka-mountain-picker/`;
- the live static index matches release `20260827-mountain-v12-map-order`;
- `/mountain/api/weather` proxies to `127.0.0.1:4188/weather`;
- `helper-sites-osaka-mountain-weather.service` is active and configured;
- the weather service currently points to `20260826-mountain-v5-weather-cards/server` and has 14 cached ranges.

The bootstrap seeds an immutable release from these exact live files before changing the Nginx alias, so the public page does not change during installation and a rollback point exists immediately.

## Architecture

```text
GitHub workflow_dispatch over HTTPS
  → repository-scoped self-hosted runner on Lightsail
  → checkout an exact helper_sites commit
  → test and build /mountain static files plus weather-api.mjs
  → request a short-lived GitHub Actions OIDC token
  → POST the checksummed tarball to 127.0.0.1:4191
  → root-owned deployd verifies OIDC, SHA-256, size and tar paths
  → immutable static/weather release + atomic symlinks
  → weather restart/health + public /mountain HTTP verification
```

The deploy API is localhost-only. It accepts only the GitHub-signed identity of `whaleinblack/chufa.wang/.github/workflows/deploy-mountain.yml` on `refs/heads/main`, with audience `osaka-mountain-deploy` and event `workflow_dispatch`. No deploy token or client SSH is used after bootstrap.

## One-time bootstrap

Run once in the AWS Lightsail browser terminal. This uses GitHub HTTPS, not a client SSH connection:

```bash
export HELPER_SHA='<latest full codex/osaka-mountain-picker commit>'
cd /tmp
BOOTSTRAP_DIR="$(mktemp -d)"
git clone --filter=blob:none --no-checkout \
  https://github.com/whaleinblack/helper_sites.git "$BOOTSTRAP_DIR"
cd "$BOOTSTRAP_DIR"
git fetch --no-tags origin codex/osaka-mountain-picker
git checkout --detach "$HELPER_SHA"
test "$(git rev-parse HEAD)" = "$HELPER_SHA"
sudo bash sites/osaka-mountain-picker/ops/http-deploy/install-mountain-http-deploy.sh \
  sites/osaka-mountain-picker/ops/http-deploy
```

The installer:

- copies the current `/mountain` page and current weather code into a bootstrap release;
- atomically creates `/srv/helper_sites/releases/osaka-mountain-picker-http/current`;
- changes only the existing `/mountain` alias in `/etc/nginx/snippets/helper-sites.conf`;
- backs up and validates Nginx before reload;
- installs the localhost OIDC deploy service and reviewed weather unit;
- verifies deployd, weather health and the unchanged public page.

The old static directory, historical releases, cache and OpenWeather provider environment remain untouched.

## GitHub control plane

The existing GitHub Environment is still named `outdoor` for compatibility and already contains `OUTDOOR_GOOGLE_MAPS_API_KEY`. The workflow name and destination are now `mountain`; no Basic Auth secrets are required because current public access is preserved.

The workflow must be present on the default `main` branch of `whaleinblack/chufa.wang`.

## Normal HTTPS deployment

```bash
HELPER_SHA="$(gh api repos/whaleinblack/helper_sites/git/ref/heads/codex/osaka-mountain-picker --jq .object.sha)"
gh workflow run deploy-mountain.yml \
  -R whaleinblack/chufa.wang \
  --ref main \
  -f action=deploy \
  -f helper_commit="$HELPER_SHA"
gh run watch -R whaleinblack/chufa.wang
```

Status and rollback:

```bash
gh workflow run deploy-mountain.yml -R whaleinblack/chufa.wang --ref main -f action=status
gh workflow run deploy-mountain.yml -R whaleinblack/chufa.wang --ref main -f action=rollback
```

## Server layout

| Purpose | Path / port |
| --- | --- |
| HTTP-managed releases | `/srv/helper_sites/releases/osaka-mountain-picker-http/releases` |
| Active combined release | `/srv/helper_sites/releases/osaka-mountain-picker-http/current` |
| Pre-HTTP historical releases | `/srv/helper_sites/releases/osaka-mountain-picker` |
| Previous manual live directory | `/srv/helper_sites/sites/osaka-mountain-picker` |
| Weather service current link | `/srv/helper_sites/services/osaka-mountain-weather/current` |
| Weather cache | `/srv/helper_sites/services/osaka-mountain-weather/cache/weather.json` |
| Weather API | `127.0.0.1:4188` |
| OIDC deploy API | `127.0.0.1:4191` |
| Public URL | `https://chufa.wang/mountain/` |

## Recovery

- Prefer the workflow's `rollback` action; it swaps both static and weather releases.
- Inspect `journalctl -u osaka-mountain-deployd` and `journalctl -u helper-sites-osaka-mountain-weather` from the Lightsail browser terminal when needed.
- The installer prints the Nginx backup path. Restore it and run `nginx -t` before reload only if the HTTP-managed alias itself must be removed.
- Never commit or package `.env`, API keys, cache data, Sites identity or D1 state.
