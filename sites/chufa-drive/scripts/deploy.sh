#!/usr/bin/env bash
# Build locally and install on chufa.wang. Usage: scripts/deploy.sh
# Requires SSH_KEY and KNOWN_HOSTS (pinned host key) environment variables.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SSH_KEY:?set SSH_KEY to the Lightsail private key}"
: "${KNOWN_HOSTS:?set KNOWN_HOSTS to the pinned known_hosts file}"
HOST="${DEPLOY_HOST:-ubuntu@chufa.wang}"
SSH=(ssh -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" -o HostKeyAlias=18.180.212.51 -o StrictHostKeyChecking=yes)
SCP=(scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" -o HostKeyAlias=18.180.212.51 -o StrictHostKeyChecking=yes)

npm run build
node --test tests/server.test.mjs
REL="$(date +%Y%m%d-%H%M%S)"
tar -czf ".local/release-$REL.tgz" package.json server dist deploy
"${SCP[@]}" ".local/release-$REL.tgz" "$HOST:/tmp/chufa-drive-$REL.tgz"
"${SSH[@]}" "$HOST" "sudo bash -s" <<REMOTE
set -euo pipefail
ROOT=/srv/helper_sites/services/chufa-drive
id chufa-drive >/dev/null 2>&1 || useradd --system --home-dir \$ROOT --shell /usr/sbin/nologin chufa-drive
install -d -o root -g root -m 755 \$ROOT \$ROOT/releases
install -d -o chufa-drive -g chufa-drive -m 750 \$ROOT/data
install -d -o chufa-drive -g chufa-drive -m 700 \$ROOT/state
mkdir -p \$ROOT/releases/$REL
tar -xzf /tmp/chufa-drive-$REL.tgz -C \$ROOT/releases/$REL
rm -f /tmp/chufa-drive-$REL.tgz
chown -R root:root \$ROOT/releases/$REL
chmod -R go-w \$ROOT/releases/$REL
ln -sfn \$ROOT/releases/$REL \$ROOT/current
install -m 644 \$ROOT/current/deploy/chufa-drive.service /etc/systemd/system/chufa-drive.service
systemctl daemon-reload
systemctl enable chufa-drive >/dev/null 2>&1
systemctl restart chufa-drive
# refresh the nginx snippet when it changed (the include line itself was added once, by hand)
if ! cmp -s \$ROOT/current/deploy/nginx-drive.conf /etc/nginx/snippets/chufa-drive.conf; then
  cp -a /etc/nginx/snippets/chufa-drive.conf /etc/nginx/snippets/chufa-drive.conf.bak 2>/dev/null || true
  install -m 644 \$ROOT/current/deploy/nginx-drive.conf /etc/nginx/snippets/chufa-drive.conf
  if nginx -t 2>/dev/null; then systemctl reload nginx; echo "nginx snippet updated"; else
    cp -a /etc/nginx/snippets/chufa-drive.conf.bak /etc/nginx/snippets/chufa-drive.conf; echo "nginx test failed; snippet restored" >&2; exit 1; fi
fi
# keep the three newest releases
ls -1dt \$ROOT/releases/*/ | tail -n +4 | xargs -r rm -rf
sleep 1
systemctl is-active chufa-drive
curl -fsS -o /dev/null -w 'local http %{http_code}\n' http://127.0.0.1:4191/drive/
REMOTE
