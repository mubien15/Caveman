#!/bin/bash
# The Artifact host wraps pages in its own <html><head><body>, so strip ours for publishing.
set -e
cd "$(dirname "$0")/.."
sed -e '1,4d' -e '/^<\/head>$/d' -e '/^<body>$/d' -e '/^<\/body>$/d' -e '/^<\/html>$/d' index.html > page.html
echo "page.html: $(wc -l < page.html) lines"
