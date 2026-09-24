# Custom music

Currently filled in with 5 tracks that play as a looping playlist (in this
order) when the player toggles MUSIC: ON, advancing to the next track each
time one ends and wrapping back to the first after the last:

```
kaiju-showdown.mp3
neon-killswitch.mp3
neon-killswitch-2.mp3
neon-rush.mp3
neon-armageddon.mp3
```

Any of these can be replaced or removed - a missing file is just skipped in
the rotation. If none are present, MUSIC: ON is silent (there's no generated
fallback track).

MP3 is required (not ogg/wav/m4a) for broad compatibility, including iOS
Safari/WKWebView where this game also runs as a native app shell.
