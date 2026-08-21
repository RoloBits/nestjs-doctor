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
