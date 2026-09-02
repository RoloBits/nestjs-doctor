#!/usr/bin/env bash
# Re-encode the tcut recording. The raw output is 1832x1600 @60fps H.264 High;
# this drops it to 30fps Main with the moov atom up front.
set -euo pipefail

src="${1:-nestjs-doctor-demo.mp4}"
dst="${2:-demo.mp4}"

ffmpeg -y -i "$src" \
  -vf "scale=1232:-2:flags=lanczos,fps=30" \
  -c:v libx264 -profile:v main -level 4.1 -pix_fmt yuv420p -crf 24 \
  -movflags +faststart -an "$dst"

ffprobe -v error -show_entries stream=width,height,r_frame_rate,profile -of default=nw=1 "$dst"
