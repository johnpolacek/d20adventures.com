#!/bin/sh
# Parallel dev worktree workflow for d20adventures.com
# Usage: pnpm wt:<cmd> [args]  (see wiki/plans/parallel-dev-worktrees.md)
set -eu

PROJECT_NAME="d20adventures"
CMD="${1:-help}"
if [ $# -gt 0 ]; then shift; fi

# --- helpers ---------------------------------------------------------------

main_checkout() {
  # First entry in `git worktree list` is the main checkout
  git worktree list --porcelain | sed -n 's/^worktree //p' | head -1
}

worktrees_dir() {
  echo "$(dirname "$(main_checkout)")/$(basename "$(main_checkout)").worktrees"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//'
}

worktree_path_for() {
  echo "$(worktrees_dir)/$(slugify "$1")"
}

url_for_branch() {
  if [ "$1" = "main" ]; then
    echo "https://$PROJECT_NAME.localhost"
  else
    echo "https://$(slugify "$1").$PROJECT_NAME.localhost"
  fi
}

require_clean() { # $1 = path, $2 = label
  if [ -n "$(git -C "$1" status --porcelain)" ]; then
    echo "ERROR: $2 ($1) has uncommitted changes. Commit or stash before continuing." >&2
    exit 1
  fi
}

# --- commands ---------------------------------------------------------------

cmd_doctor() {
  echo "== wt doctor =="
  fail=0

  echo "- git worktrees:"
  git worktree list | sed 's/^/    /'

  if command -v portless >/dev/null 2>&1; then
    echo "- portless: installed ($(command -v portless))"
    portless list 2>/dev/null | sed 's/^/    /' || echo "    proxy not running — start with: portless proxy start"
  else
    echo "- portless: MISSING. Install: npm install -g portless"
    fail=1
  fi

  if command -v pnpm >/dev/null 2>&1; then echo "- pnpm: installed"; else echo "- pnpm: MISSING"; fail=1; fi

  if [ -f .env.local ] && grep -q '^CONVEX_DEPLOYMENT=' .env.local; then
    echo "- convex: $(grep '^CONVEX_DEPLOYMENT=' .env.local | head -1)"
  else
    echo "- convex: no CONVEX_DEPLOYMENT in .env.local — run: npx convex dev --once"
    fail=1
  fi

  echo "- shared state warnings:"
  echo "    S3 buckets (AWS_BUCKET_*) are SHARED across worktrees — worktrees default to placeholder images."
  echo "    Clerk dev instance is SHARED — avoid parallel work mutating user/token state."
  echo "    Each worktree gets its own Convex project (isolated database)."

  [ "$fail" -eq 0 ] && echo "doctor: OK" || { echo "doctor: ISSUES FOUND"; exit 1; }
}

cmd_create() {
  branch="${1:?usage: pnpm wt:create <branch>}"
  slug="$(slugify "$branch")"
  root="$(main_checkout)"
  path="$(worktree_path_for "$branch")"

  if [ -d "$path" ]; then echo "ERROR: $path already exists" >&2; exit 1; fi
  mkdir -p "$(worktrees_dir)"

  echo "== creating worktree $path on branch $branch (from main) =="
  if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$root" worktree add "$path" "$branch"
  else
    git -C "$root" worktree add -b "$branch" "$path" main
  fi

  echo "== copying env (stripping Convex pointers so a fresh project is provisioned) =="
  for f in .env .env.local; do
    if [ -f "$root/$f" ]; then
      grep -vE '^(CONVEX_DEPLOYMENT|CONVEX_URL|NEXT_PUBLIC_CONVEX_URL|NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES)=' "$root/$f" > "$path/$f"
    fi
  done
  {
    echo ""
    echo "# worktree-local (added by wt:create)"
    echo "NEXT_PUBLIC_APP_URL=$(url_for_branch "$branch")"
    echo "NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES=true"
  } >> "$path/.env.local"

  echo "== pnpm install =="
  # --ignore-scripts: postinstall runs `convex codegen`, which fails before the
  # worktree's Convex project exists; `convex dev --once` below does codegen anyway.
  (cd "$path" && pnpm install --ignore-scripts)

  echo "== provisioning isolated Convex project: $PROJECT_NAME-$slug =="
  # Writes CONVEX_DEPLOYMENT / NEXT_PUBLIC_CONVEX_URL into the worktree's .env.local.
  # WT_CONVEX_TEAM can override the team if the account has more than one.
  (cd "$path" && npx convex dev --once --configure new --project "$PROJECT_NAME-$slug" ${WT_CONVEX_TEAM:+--team "$WT_CONVEX_TEAM"} --dev-deployment cloud) || {
    echo "WARNING: Convex provisioning failed. Run manually inside $path:" >&2
    echo "  npx convex dev --once --configure new --project $PROJECT_NAME-$slug --dev-deployment cloud" >&2
  }

  if [ ! -f "$path/wiki/plans/$slug.md" ]; then
    cat > "$path/wiki/plans/$slug.md" <<EOF
# $branch

[Plans](index.md) · [Wiki Home](../index.md)

Status: Active ($(date +%Y-%m-%d))

## Goal

(describe the feature)

## Progress

- [ ] ...
EOF
  fi

  cat <<EOF

== worktree ready ==
Branch: $branch
Path:   $path
URL:    $(url_for_branch "$branch")
Plan:   wiki/plans/$slug.md
DB:     Convex project $PROJECT_NAME-$slug (empty — seed with: pnpm wt:seed $branch)
Start:  cd $path && pnpm wt:dev
Finish: pnpm wt:finish $branch
Note:   S3 + Clerk are shared; placeholder images enabled in this worktree.
EOF
}

cmd_seed() {
  branch="${1:?usage: pnpm wt:seed <branch>}"
  root="$(main_checkout)"
  path="$(worktree_path_for "$branch")"
  [ -d "$path" ] || { echo "ERROR: no worktree at $path" >&2; exit 1; }

  snapshot="$(mktemp -d)/seed.zip"
  echo "== exporting data from main's Convex deployment =="
  (cd "$root" && npx convex export --path "$snapshot")
  echo "== importing into worktree's Convex project (replaces all data there) =="
  (cd "$path" && npx convex import --replace-all -y "$snapshot")
  rm -f "$snapshot"
  echo "seed: done"
}

cmd_list() {
  root="$(main_checkout)"
  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
    branch="$(git -C "$wt" branch --show-current 2>/dev/null || echo '?')"
    dirty="clean"; [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ] && dirty="DIRTY"
    convex="$(grep '^CONVEX_DEPLOYMENT=' "$wt/.env.local" 2>/dev/null | cut -d= -f2 || true)"
    echo "$branch"
    echo "    path:   $wt"
    echo "    url:    $(url_for_branch "$branch")"
    echo "    status: $dirty"
    echo "    convex: ${convex:-none}"
  done
}

cmd_resume() {
  branch="${1:?usage: pnpm wt:resume <branch>}"
  slug="$(slugify "$branch")"
  path="$(worktree_path_for "$branch")"
  [ -d "$path" ] || { echo "ERROR: no worktree at $path" >&2; exit 1; }

  echo "Branch: $branch"
  echo "Path:   $path"
  echo "URL:    $(url_for_branch "$branch")"
  echo "Status:"
  git -C "$path" status --short | sed 's/^/    /'
  echo "Recent commits:"
  git -C "$path" log --oneline -5 | sed 's/^/    /'
  if [ -f "$path/wiki/plans/$slug.md" ]; then
    echo "Plan: wiki/plans/$slug.md"
    sed -n '1,20p' "$path/wiki/plans/$slug.md" | sed 's/^/    /'
  else
    echo "Plan: none found at wiki/plans/$slug.md"
  fi
  echo "Start:  cd $path && pnpm wt:dev"
  echo "Finish: pnpm wt:finish $branch"
}

cmd_dev() {
  branch="$(git branch --show-current)"
  if [ "$branch" = "main" ]; then name="$PROJECT_NAME"; else name="$(slugify "$branch").$PROJECT_NAME"; fi
  command -v portless >/dev/null 2>&1 || { echo "ERROR: portless not installed (npm install -g portless)" >&2; exit 1; }
  echo "== $(url_for_branch "$branch") =="
  exec portless "$name" pnpm dev
}

cmd_open() {
  branch="${1:-$(git branch --show-current)}"
  url="$(url_for_branch "$branch")"
  if command -v portless >/dev/null 2>&1 && portless list 2>/dev/null | grep -q "$(slugify "$branch").$PROJECT_NAME\|^$PROJECT_NAME"; then
    :
  else
    echo "note: no active portless route found — start the server first:"
    echo "  cd $(worktree_path_for "$branch") && pnpm wt:dev"
  fi
  echo "opening $url"
  open "$url"
}

cmd_finish() {
  branch="${1:?usage: pnpm wt:finish <branch>}"
  if [ "$branch" = "main" ]; then echo "ERROR: cannot finish main" >&2; exit 1; fi
  slug="$(slugify "$branch")"
  root="$(main_checkout)"
  path="$(worktree_path_for "$branch")"
  [ -d "$path" ] || { echo "ERROR: no worktree at $path" >&2; exit 1; }

  require_clean "$path" "feature worktree"
  require_clean "$root" "main checkout"

  if git -C "$root" remote get-url origin >/dev/null 2>&1; then
    echo "== fast-forwarding main =="
    git -C "$root" pull --ff-only origin main
  fi

  echo "== overlap check against other active worktrees =="
  tmpdir="$(mktemp -d)"
  git -C "$root" diff --name-only "main...$branch" | sort > "$tmpdir/mine"
  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
    other="$(git -C "$wt" branch --show-current 2>/dev/null || true)"
    { [ -z "$other" ] || [ "$other" = "main" ] || [ "$other" = "$branch" ]; } && continue
    git -C "$root" diff --name-only "main...$other" 2>/dev/null | sort > "$tmpdir/theirs"
    common="$(comm -12 "$tmpdir/mine" "$tmpdir/theirs")"
    if [ -n "$common" ]; then echo "WARNING: overlap with $other:"; echo "$common" | sed 's/^/    /'; fi
  done
  rm -rf "$tmpdir"

  if [ -f "$path/wiki/plans/$slug.md" ]; then
    echo "== archiving plan to wiki/plans/zzz-completed/ =="
    (cd "$path" \
      && printf '\nFinished: %s (merged to main, policy: merge)\n' "$(date +%Y-%m-%d)" >> "wiki/plans/$slug.md" \
      && mkdir -p wiki/plans/zzz-completed \
      && git mv "wiki/plans/$slug.md" "wiki/plans/zzz-completed/$slug.md" \
      && git commit -m "Archive plan for $branch")
  fi

  echo "== merging $branch into main (no-ff) =="
  git -C "$root" merge --no-ff -m "Merge $branch" "$branch"

  echo "== removing worktree and branch =="
  git -C "$root" worktree remove "$path"
  git -C "$root" branch -d "$branch"
  git -C "$root" worktree prune

  echo ""
  echo "finish: done. Reminder — delete the Convex project '$PROJECT_NAME-$slug' in the dashboard"
  echo "(https://dashboard.convex.dev) to remove the worktree's isolated database. No CLI for this."
}

cmd_clean() {
  git worktree prune
  echo "pruned stale git worktree metadata."
  wtd="$(worktrees_dir)"
  if [ -d "$wtd" ]; then
    for d in "$wtd"/*/; do
      [ -d "$d" ] || continue
      if ! git worktree list --porcelain | grep -qF "worktree ${d%/}"; then
        echo "orphaned directory (not a registered worktree, NOT deleted): $d"
      fi
    done
  fi
}

cmd_help() {
  cat <<'EOF'
wt — parallel dev worktrees (see wiki/plans/parallel-dev-worktrees.md)
  pnpm wt:doctor            environment + isolation checks
  pnpm wt:create <branch>   new worktree + env + install + isolated Convex project
  pnpm wt:seed <branch>     clone main's Convex data into the worktree's project
  pnpm wt:list              active worktrees, URLs, dirty status
  pnpm wt:resume <branch>   status, plan, next steps
  pnpm wt:dev               run dev server behind this checkout's portless URL
  pnpm wt:open [branch]     open the worktree URL in the browser
  pnpm wt:finish <branch>   archive plan, merge (no-ff), remove worktree
  pnpm wt:clean             prune stale metadata (reports orphans, never deletes)
EOF
}

case "$CMD" in
  doctor|create|seed|list|resume|dev|open|finish|clean|help) "cmd_$CMD" "$@" ;;
  *) echo "unknown command: $CMD" >&2; cmd_help; exit 1 ;;
esac
