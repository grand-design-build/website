# Hero video tools

macOS has no ffmpeg and its built-in `avconvert` only offers quality presets --
asked for 720p it produced a file BIGGER than the 20 MB original. These two
small programs give real control instead.

**To replace the hero film: double-click `encode-hero.command`** and drag the
video in when it asks. It writes `global/media/hero.mp4` plus the two stills,
then you rebuild with `preview.command`.

| | |
|---|---|
| `venc.swift` | re-encodes at a chosen size and bitrate, drops the audio track, puts the index at the front of the file so it starts playing before it finishes downloading |
| `frame.swift` | pulls a single frame out as a JPEG, for the poster and the mobile still |

Both compile themselves the first time they run. To use them by hand:

```
swiftc -O venc.swift -o venc
./venc  input.mp4 out.mp4 1600 900 1800 h264 [maxSeconds]
./frame out.mp4 still.jpg 6.0 1600 0.74
```

**The settings the current hero uses, and why:**

- **1600x900, 1.8 Mbps, 3.7 MB.** Budget is 4 MB. The footage is slow interior
  work, which compresses well; fast movement would need more.
- **H.264 only.** HEVC would save about 1 MB, but a browser that claims HEVC
  support and then fails does NOT fall back to the next `<source>`, and a black
  hero is not worth 1 MB.
- **No audio.** A hero that makes noise is a hero people close.
- **Two stills, on purpose.** `hero-poster.jpg` is the film's own opening frame
  so the desktop hero does not jump when playback starts. `hero-still.jpg` is a
  finished room -- that is the hero for the ~52% on mobile, who never load the
  film at all.
