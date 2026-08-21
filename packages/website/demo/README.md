# Landing page recording

The terminal recording on the landing page (`public/demo.mp4`) is generated, not
hand-edited. To change it:

```bash
cd packages/website/demo
bun add -g termcut          # once
tcut demo.video.ts --theme ir-black --width 880 --height 800 --force
./encode-web.sh
```

`animate-scan.mjs` replays the scan and the agent session. The scores, findings,
and timings in it are real output from scanning the `bad-practices` fixture; the
script exists because the real CLI prints its report all at once, which cannot
show a fix landing in place.

`encode-web.sh` is not optional. tcut renders at 1832x1600 @60fps, which Chrome
refuses to start playing — the video element stalls at `readyState 0` with no
error. The re-encode drops it to 30fps Main profile with `+faststart`.

## The README GIF

GitHub strips `<video>` from READMEs, so `public/demo.gif` carries the same
recording there. Regenerate it from the encoded mp4:

```bash
ffmpeg -y -i ../public/demo.mp4 \
  -vf "fps=12,scale=760:-1:flags=lanczos,palettegen=stats_mode=diff" /tmp/palette.png
ffmpeg -y -i ../public/demo.mp4 -i /tmp/palette.png \
  -lavfi "fps=12,scale=760:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  ../public/demo.gif
```

A real player is possible, but only by uploading the mp4 through GitHub's own
UI, which mints a `user-attachments/assets/...` URL. That cannot be scripted.
