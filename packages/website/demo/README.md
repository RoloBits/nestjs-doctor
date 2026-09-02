# README recording

The landing page renders the demo live from
`src/components/landing/demo/script.ts`. This directory records the same three
acts as a video for the README GIF (`public/demo.gif`), because GitHub strips
`<video>` from READMEs. The two scripts carry the same scores, findings and
timings; change them together. To regenerate the GIF:

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

`encode-web.sh` drops tcut's 1832x1600 @60fps output to 30fps and writes
`demo.mp4` next to it. Both mp4 files are intermediates and stay out of git.

## The GIF

Build it from the encoded mp4:

```bash
ffmpeg -y -i demo.mp4 \
  -vf "fps=12,scale=760:-1:flags=lanczos,palettegen=stats_mode=diff" /tmp/palette.png
ffmpeg -y -i demo.mp4 -i /tmp/palette.png \
  -lavfi "fps=12,scale=760:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  ../public/demo.gif
```

A real player is possible, but only by uploading the mp4 through GitHub's own
UI, which mints a `user-attachments/assets/...` URL. That cannot be scripted.
