#!/bin/bash
# Rebuild dist/ the way the Artifact publisher wraps page.html.
# Local-only swaps: CDN three.js -> vendored copy, drop Google Fonts (both blocked by egress policy here).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/vendor
{
  printf '%s' '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'
  echo
  cat page.html
  echo
  printf '%s\n' '</body></html>'
} > dist/index.html
sed -i 's#https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js#vendor/three.min.js#' dist/index.html
sed -i '/fonts.googleapis.com/d;/fonts.gstatic.com/d' dist/index.html
cp vendor/three.min.js dist/vendor/
cp style.css dist/
cp -r js dist/
node --check js/core.js && node --check js/blocks.js && node --check js/world.js \
  && node --check js/entities.js && node --check js/ui.js && node --check js/input.js && node --check js/main.js
echo "built dist/ + syntax ok"
