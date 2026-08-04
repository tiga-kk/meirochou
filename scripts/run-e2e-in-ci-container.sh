#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ci_image=${PLAYWRIGHT_CI_IMAGE:-mcr.microsoft.com/playwright:v1.61.1-noble}
ci_node_version=22.14.0
ci_npm_version=10.9.2
host_uid=$(id -u)
host_gid=$(id -g)

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to reproduce the GitHub Actions Playwright environment." >&2
  exit 1
fi

docker run --rm --init --ipc=host \
  --user "${host_uid}:${host_gid}" \
  --env CI=1 \
  --env "CI_NODE_VERSION=${ci_node_version}" \
  --env "CI_NPM_VERSION=${ci_npm_version}" \
  --mount "type=bind,src=${repo_root},dst=/workspace" \
  --tmpfs "/workspace/node_modules:rw,exec,size=2g,uid=${host_uid},gid=${host_gid},mode=0755" \
  --workdir /workspace \
  "${ci_image}" \
  sh -lc 'npx --yes --package=node@"${CI_NODE_VERSION}" --package=npm@"${CI_NPM_VERSION}" sh -lc '\''test "$(node --version)" = "v${CI_NODE_VERSION}" && test "$(npm --version)" = "${CI_NPM_VERSION}" && npm ci && test "$(npx playwright --version)" = "Version 1.61.1" && npx playwright test "$@"'\'' -- "$@"' -- "$@"
