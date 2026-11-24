#!/bin/bash
# Deploys the site to production. A push to main does not (vercel.json turns off git deploys), because the Hobby plan
# allows 100 deploys a day and the sessions on main push more than that. This sends exactly what origin/main holds, never
# the working tree, which other sessions are editing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git fetch -q origin main
sha=$(git rev-parse --short origin/main)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
git archive origin/main | tar -x -C "$dir"
cp -R .vercel "$dir/.vercel"
echo "Deploying origin/main at $sha"
vercel deploy --prod --yes --cwd "$dir" --meta commit="$sha"
