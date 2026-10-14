# `/outdoor` HTTP-only deployment

This directory provides the reviewed path for publishing the standalone mountain picker at `https://chufa.wang/outdoor/` without client-side SSH.

## Architecture

```text
GitHub workflow_dispatch over HTTPS
  → repository-scoped self-hosted runner on Lightsail
  → checkout an exact helper_sites commit
  → test and build a /outdoor static artifact plus the weather service
  → request a short-lived GitHub Actions OIDC token
  → POST the checksummed tarball to 127.0.0.1:4191
  → root-owned deployd verifies OIDC, paths, links and SHA-256
  → immutable release + atomic static/weather symlinks + weather health check
  → localhost and public HTTP verification
```

The deploy endpoint is bound to localhost. It accepts only a GitHub-signed OIDC identity for `whaleinblack/chufa.wang`, the `deploy-outdoor.yml` workflow on `refs/heads/main`, and a manual `workflow_dispatch` event. There is no long-lived deployment token.

The public page is independently protected by `/etc/nginx/.htpasswd_chufa_outdoor`; it does not use the main site's account database or cookie. Nginx serves static files directly and proxies only `/outdoor/api/weather` to the existing localhost weather service on port 4188.

## One-time bootstrap

The initial root service and Nginx location cannot be created by an unprivileged Action. Run this once in the AWS Lightsail browser console. It uses GitHub HTTPS, not SSH:

```bash
export HELPER_SHA='<full commit from codex/osaka-mountain-picker>'
cd /tmp
BOOTSTRAP_DIR="$(mktemp -d)"
git clone --filter=blob:none --no-checkout \
  https://github.com/whaleinblack/helper_sites.git "$BOOTSTRAP_DIR"
cd "$BOOTSTRAP_DIR"
git fetch --no-tags origin codex/osaka-mountain-picker
git checkout --detach "$HELPER_SHA"
test "$(git rev-parse HEAD)" = "$HELPER_SHA"
sudo bash sites/osaka-mountain-picker/ops/http-deploy/install-outdoor-http-deploy.sh \
  sites/osaka-mountain-picker/ops/http-deploy
```

Before running the installer, confirm `HELPER_SHA` against the branch head shown by GitHub. The installer:

- creates root-owned immutable release and incoming directories readable by Nginx;
- installs the root-owned localhost deployment service;
- installs the reviewed weather service unit and localhost deploy service;
- adds the reviewed `/outdoor` Nginx include before the main catch-all route;
- validates Nginx and restores its timestamped backup on failure;
- creates an independent Basic Auth password and prints it once.

OpenWeather continues to come from the existing root-managed provider environment at `/srv/travel_planner/shared/secrets/providers/.env`; do not copy it into GitHub or the static bundle.

## GitHub environment

Create the `outdoor` Environment in `whaleinblack/chufa.wang` and add these secrets:

- `OUTDOOR_GOOGLE_MAPS_API_KEY`: browser key restricted to `https://chufa.wang/outdoor/*` and the Maps JavaScript API;
- `OUTDOOR_BASIC_AUTH_USERNAME`: normally `outdoor`;
- `OUTDOOR_BASIC_AUTH_PASSWORD`: the one-time value printed by the installer.

No deployment token is required; the workflow uses GitHub OIDC.

The deployment workflow must exist on the repository's default `main` branch. It contains no mountain-site source; it only checks out an immutable `helper_sites` revision and sends the verified artifact to localhost.

## Normal HTTPS deployment

From any authenticated GitHub CLI or from the Actions UI:

```bash
HELPER_SHA="$(gh api repos/whaleinblack/helper_sites/git/ref/heads/codex/osaka-mountain-picker --jq .object.sha)"
gh workflow run deploy-outdoor.yml \
  -R whaleinblack/chufa.wang \
  --ref main \
  -f action=deploy \
  -f helper_commit="$HELPER_SHA"
gh run watch -R whaleinblack/chufa.wang
```

Status and rollback are also HTTPS-only:

```bash
gh workflow run deploy-outdoor.yml -R whaleinblack/chufa.wang --ref main -f action=status
gh workflow run deploy-outdoor.yml -R whaleinblack/chufa.wang --ref main -f action=rollback
```

## Server layout

| Purpose | Path / port |
| --- | --- |
| Immutable releases | `/srv/helper_sites/releases/osaka-mountain-picker-http/releases` |
| Active static/weather release | `/srv/helper_sites/releases/osaka-mountain-picker-http/current` |
| Weather service current link | `/srv/helper_sites/services/osaka-mountain-weather/current` |
| Weather cache | `/srv/helper_sites/services/osaka-mountain-weather/cache/weather.json` |
| Deploy state | `/srv/helper_sites/releases/osaka-mountain-picker-http/state.json` |
| Weather API | `127.0.0.1:4188` |
| OIDC deploy API | `127.0.0.1:4191` |
| Public URL | `https://chufa.wang/outdoor/` |

The deployment service keeps the current and previous releases protected from pruning, preserves failed candidates for diagnosis, and restores the previous symlink if application health fails.

## Recovery

- Use the workflow's `rollback` operation first.
- If the deployment service is unhealthy, use the Lightsail browser console to inspect `journalctl -u osaka-mountain-outdoor-deployd` and `journalctl -u helper-sites-osaka-mountain-weather`.
- The installer prints the exact Nginx backup path. Restore that file and run `nginx -t` before reloading Nginx if the mount itself must be removed.
- Never copy a local `.env`, Sites project ID, D1 database, or ChatGPT authentication header into a release.
