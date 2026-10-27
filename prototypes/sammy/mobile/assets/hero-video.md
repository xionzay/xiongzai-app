# Home hero video

Source: the Grok-generated MP4 supplied and approved by the user on 2026-10-12. The original file in Downloads is preserved.

Bundled assets:
- `hero-loop.mp4`: 960 × 540, 24 fps, H.264/yuv420p, 5.625 seconds, 562,596 bytes, no audio track.
- `hero-poster.jpg`: first frame of the processed clip, used while loading, on errors, or when decorative motion is disabled.

The source's first and last frames did not match. Processing starts at 0.35 seconds, then crossfades the last 0.35 seconds into the original opening. This softens the reset; it is a crossfade rather than a newly generated seamless animation.

FFmpeg filter:
```text
[0:v:0]fps=24,scale=960:540,split=2[body][head];
[body]trim=start=0.35:end=6,setpts=PTS-STARTPTS[main];
[head]trim=start=0:end=0.35,setpts=PTS-STARTPTS[opening];
[main][opening]xfade=transition=fade:duration=0.35:offset=5.3,format=yuv420p[loop]
```

Encoding uses `-map '[loop]' -an -c:v libx264 -crf 22 -preset slow -movflags +faststart`.
The hero keeps all UI text and controls outside the video, so language switching and accessibility do not depend on baked-in content.

The player applies `playbackRate = 0.6` whenever playback starts or resumes, including Fast Refresh. Each 5.625-second clip takes about 9.4 seconds to play; the bundled video is unchanged.
