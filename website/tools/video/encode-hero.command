#!/bin/bash
# Double-click this to turn a raw video into a web-ready hero film.
# It asks for the file, then writes hero.mp4 + the two stills straight into
# website/global/. Rebuild afterwards (preview.command) to see it.
cd "$(dirname "$0")"
GLOBAL="../../global"

echo "Drag the video file into this window and press Return:"
read -r SRC
SRC="${SRC//\'/}"                      # strip quotes Finder adds
SRC="$(echo "$SRC" | xargs)"
[ -f "$SRC" ] || { echo "Cannot find that file."; read -n1 -p "Press any key."; exit 1; }

# Build the two small tools the first time, then reuse them.
[ -x ./venc ]  || swiftc -O venc.swift  -o venc  || exit 1
[ -x ./frame ] || swiftc -O frame.swift -o frame || exit 1

mkdir -p "$GLOBAL/media" "$GLOBAL/images"
echo
echo "Encoding 1600x900 at 1.8 Mbps (aiming under 4 MB)..."
./venc  "$SRC" "$GLOBAL/media/hero.mp4" 1600 900 1800 h264 || exit 1
echo "Poster (the film's own first frame, for desktop)..."
./frame "$GLOBAL/media/hero.mp4" "$GLOBAL/images/hero-poster.jpg" 0.05 1600 0.74
echo "Still (a finished room, for mobile) - taken at 6s; change the 6.0 below to pick another moment."
./frame "$GLOBAL/media/hero.mp4" "$GLOBAL/images/hero-still.jpg"  6.0  1600 0.74
echo
echo "Done. Now double-click preview.command to rebuild and look at it."
read -n1 -p "Press any key to close."
