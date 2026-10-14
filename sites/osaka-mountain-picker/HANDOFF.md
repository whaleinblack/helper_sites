# 下一座山 · 大阪発 — Project handoff

Last reconciled: 2026-10-14 (Asia/Tokyo)

## Product state

The project is a four-season mountain picker centered on Osaka Station. The current implemented catalog contains 14 mountain areas, 64 peaks and 48 representative route indexes. Phase 1 selects an area and peak; Phase 2 compares route summaries; Phase 3 combines weather, climate and transport; Phase 4 creates an explainable trip signal.

Current hosted Site: `https://osaka-mountain-picker.whaleinblack.chatgpt.site/` (owner-private Sites deployment).

Target independent mount: `https://chufa.wang/outdoor/`.

Existing legacy/public mount: `https://chufa.wang/mountain/` with its live filesystem-cached weather API. Leave it in place during `/outdoor` acceptance so rollback does not depend on the new mount.

The target is intentionally not linked from the chufa.wang main product. Its source remains in `whaleinblack/helper_sites`; only the central Nginx include and a small deployment workflow belong in `whaleinblack/chufa.wang`.

## Source of truth

- Repository: `https://github.com/whaleinblack/helper_sites`
- Branch: `codex/osaka-mountain-picker`
- Site directory: `sites/osaka-mountain-picker`
- Shared standards: `docs/helper-site-standards.md`
- Machine-readable registry: `sites.json`
- HTTP deployment implementation: `sites/osaka-mountain-picker/ops/http-deploy`

Never commit `.env.local`, real API keys, the live Sites `project_id`, weather cache data or server runtime state. The public repository uses a null Sites project ID placeholder; the existing Sites checkout retains its real identity locally.

## Local development and verification

```bash
cd sites/osaka-mountain-picker
npm ci
npm test
npm run lint
npm run build
```

Static `/outdoor` verification uses:

```bash
MOUNTAIN_PUBLIC_BASE_PATH=/outdoor/ \
MOUNTAIN_WEATHER_ENDPOINT=/outdoor/api/weather \
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='<restricted browser key>' \
npm run build:static
```

Expected checks:

- `dist-static/index.html` and every JS/CSS reference remain under `/outdoor/`;
- the bundle references `/outdoor/api/weather` and contains no server secret;
- `/outdoor/api/weather?rangeId=rokko` returns normalized JSON through the existing port-4188 service;
- missing OpenWeather configuration degrades to a visible `unconfigured` response rather than a blank page.

## Deployment handoff

Daily deployment is HTTPS-only and does not use client SSH. The authoritative procedure, bootstrap, rollback and server layout are in [`ops/http-deploy/README.md`](ops/http-deploy/README.md).

Important boundary: one initial root installation is still required because an HTTP workflow cannot safely create its own Nginx route or root systemd service. Perform that step through the AWS Lightsail browser console. After bootstrap, every build, deploy, status read and rollback is a GitHub `workflow_dispatch` request over HTTPS.

Security properties:

- the deploy API binds only to `127.0.0.1:4191`;
- GitHub Actions OIDC is verified for repository, main ref, exact workflow, event, audience, expiry and RSA signature;
- artifacts require an exact helper commit, SHA-256, bounded size, safe tar paths and no links;
- releases are immutable and switched atomically;
- failed health checks restore the previous release;
- `/outdoor` uses an independent Basic Auth file;
- OpenWeather remains server-only and Google Maps uses a referrer/API-restricted browser key.

## Data and API boundaries

- Weather: the private Sites deployment uses D1; chufa.wang uses the existing port-4188 service with a 24-hour filesystem cache, seven-day stale fallback, rate limiting and One Call/5-day fallback.
- Historic climate: static JMA 1991–2020-derived profiles and representative mountain elevations.
- Maps: Google Maps JavaScript plus GSI tile overlay.
- Transport: stored Osaka Station summaries and live outbound links; Ekispert data is not permanently cached without contract confirmation.
- Routes: existing route geometry is explicitly marked schematic. Only official or license-compatible open GPX/OSM geometry may be imported and republished.
- YAMAP, YamaHack and Yamareco: search/detail links and manual verification only; do not scrape or republish protected tracks or article text.

## Known limitations and next work

1. Expand priority peaks from one representative index to verified standard, transit-friendly and traverse routes using official or ODbL-compatible geometry.
2. Replace legacy `google.maps.Marker` with `AdvancedMarkerElement` when updating map rendering.
3. Review the current Google Maps browser key restriction after the first `/outdoor` deployment.
4. Re-run data-source dates; the visible catalog verification stamp is still 2026-08-26.
5. Keep snow-season difficulty separate from the normal route constant. The UI uses `初雪・移行期`, `积雪期`, `严冬期` and `融雪・残雪期`, but it does not claim avalanche or winter-route grading.

## Operational acceptance checklist

- helper_sites commit is a full SHA on `codex/osaka-mountain-picker`;
- tests, lint and standalone build pass on the self-hosted runner;
- deployd `/healthz` succeeds before artifact upload;
- Action OIDC claims match the pinned workflow on `main`;
- the deploy service validates every static asset and the restarted weather service health succeeds;
- public Basic Auth request returns the mountain page and prefixed assets;
- Google Maps loads under the chufa.wang referrer restriction;
- weather returns either current data or a visible degraded status;
- current and previous release IDs are recorded;
- rollback workflow succeeds before declaring the handoff complete.
