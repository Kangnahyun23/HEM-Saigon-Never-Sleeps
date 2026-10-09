#!/bin/bash
# Hook SessionStart cho phiên Claude Code trên cloud: cài thư viện để lint, test, build, e2e chạy được ngay.
set -euo pipefail

# Chỉ chạy trên cloud; máy cá nhân tự cài qua `npm start`.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
node scripts/setup.mjs
