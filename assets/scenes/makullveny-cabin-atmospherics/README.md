# Makullveny cabin atmospheric layers

Five transparent PNGs, designed for the existing cabin-layer scene and its dark pine/espresso/walnut/amber palette.

| Asset | Canvas | Intended compositing use |
| --- | --- | --- |
| `ground-far.png` | 2560×300 | Low far ground; put behind the near-ground layer. |
| `ground-near.png` | 2560×360 | Darker near ground; place in front of `ground-far.png`. |
| `mist-wide.png` | 2560×420 | Soft atmospheric band; keep opacity restrained. |
| `leaves-needles-tile.png` | 900×900 | Sparse transparent tile; use with CSS `background-repeat: repeat`. |
| `lantern-hanging.png` | 420×620 | Top-edge decorative lantern; the amber flame is its only focal light. |

All PNGs have real alpha transparency. Suggested order: far ground → mist → near ground; use leaves and lantern as optional foreground decoration.
