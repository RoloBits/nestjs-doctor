# README recording

The landing page renders the demo live from
`src/components/landing/demo/script.ts`. The README shows the same desktop as
an animated SVG, `public/demo.svg`, because GitHub and npm strip `<video>` and
scripts from READMEs but play CSS animations inside an `<img>`. To regenerate
it after changing the script:

```bash
cd packages/website
bun demo/render-svg.ts
```

`render-svg.ts` imports the script's timeline, so scores, findings and timings
cannot drift. The chrome is SVG shapes, the text is real text in the viewer's
monospace font, and reduced-motion viewers get the finished frame.

## The GIF

`public/demo.gif` stays published because READMEs of already-released versions
point at it. It is recorded as a video from the same three acts:

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
