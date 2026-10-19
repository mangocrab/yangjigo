#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export npm_config_cache="${npm_config_cache:-/tmp/sejong-npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/sejong-config}"
export WRANGLER_SEND_METRICS=false
if [[ ! -f package-lock.json || ! -f src/server/index.ts ]]; then
  echo '소스가 없습니다. GitHub의 게시된 커밋 또는 소스 백업을 먼저 복원하세요.' >&2
  exit 1
fi
npm ci --no-audit --no-fund
npm run db:migrate
npm run build
npm test
