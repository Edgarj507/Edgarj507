# Custom sound effects

Drop any of these files here (all optional, MP3 only) to replace the matching
built-in generated sound. Any file you don't provide keeps using the built-in
generated sound automatically - no code changes needed either way.

| Filename              | Plays when...                                          |
|------------------------|---------------------------------------------------------|
| `move.mp3`            | a piece slides left/right                                |
| `rotate.mp3`          | a piece rotates                                          |
| `lock.mp3`            | a piece lands and locks onto the stack                   |
| `harddrop.mp3`        | a hard drop (instant slam)                               |
| `block-break.mp3`     | a block is destroyed by a kaiju beam or the UFO's laser   |
| `block-break-2.mp3`   | alternate take on the above, picked at random alongside it |
| `line-clear.mp3`      | one or more lines clear                                  |
| `level-up.mp3`        | the level increases                                       |
| `game-over.mp3`       | the run ends                                              |
| `kaiju-roar.mp3`      | a kaiju roars before attacking                            |
| `beam-fire.mp3`       | a kaiju fires its attack beam                             |
| `laser-fire.mp3`      | the UFO fires its laser                                   |
| `laser-fire-2.mp3`    | alternate take on the above, picked at random alongside it |

`block-break`/`block-break-2` and `laser-fire`/`laser-fire-2` are each a pool -
when both files in a pool are present, one is picked at random each time so
that frequent sound doesn't feel identical every time. Either file in a pool
can be removed on its own; the other keeps playing solo.
