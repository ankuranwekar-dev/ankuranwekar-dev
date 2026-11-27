#!/usr/bin/env bash
# Publishes kairos/site to the gh-pages branch, which GitHub Pages serves at
#   https://<owner>.github.io/<repo>/
# (privacy.html and support.html are the URLs App Store Connect asks for).
#
# gh-pages is a generated branch: it holds only a copy of kairos/site and is
# overwritten on every run, so this force-pushes it on purpose. Nothing else is
# touched. Run it again whenever site/ changes.
#
#   kairos/scripts/publish-site.sh [remote]     (default remote: origin)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
remote=${1:-origin}
url=$(git -C "$root" remote get-url "$remote")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cp -R "$root/kairos/site/." "$tmp/"
touch "$tmp/.nojekyll" # serve the files as they are, no Jekyll build

git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" \
  -c user.name="$(git -C "$root" config user.name)" \
  -c user.email="$(git -C "$root" config user.email)" \
  commit -q -m "Publish kairos/site ($(git -C "$root" rev-parse --short HEAD))"
git -C "$tmp" push --force "$url" gh-pages:gh-pages
echo "Published. Pages usually updates within a minute."
