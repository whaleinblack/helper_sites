# Project instructions

This repository contains helper sites and information-display pages.

## Deployment convention

- Unless the user says otherwise, deploy each site under `https://chufa.wang/sites/<site-name>/`.
- Deploy the corresponding files to `/srv/helper_sites/sites/<site-name>/`.
- Give each site its own top-level directory.
- Configure asset URLs, client-side routing, and build base paths for the `/sites/<site-name>/` prefix.
- SSH access is `codex@chufa.wang` using `C:\Users\whale\OneDrive\Git\keypair\codex-chufa-wang-ed25519` and the pinned host record at `C:\Users\whale\OneDrive\Git\keypair\known_hosts_chufa_wang`.
- The `/sites/` Nginx mapping is installed in `/etc/nginx/snippets/helper-sites.conf`. Validate Nginx before every configuration reload.

## Git convention

- Repository: `whaleinblack/helper_sites`
- SSH remote: `git@github.com:whaleinblack/helper_sites.git`
- GitHub identity: `C:\Users\whale\OneDrive\Git\keypair\id_ed25519_github`
- Default branch: `main`
- Preserve unrelated user changes and keep each site independently maintainable.
