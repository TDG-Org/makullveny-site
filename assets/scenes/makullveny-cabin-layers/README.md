# Makullveny cabin scene layers

All images are 2560×1440 PNGs and are intended to be stacked in this order:

1. `layer-1-sky-ridge.png` — opaque blue-hour sky and distant ridge.
2. `layer-2-midground-cabin.png` — transparent mid-ground conifers and the illuminated A-frame cabin.
3. `layer-3-foreground-frame.png` — transparent foreground trunks, boughs, and ground framing.

Place each image at `inset: 0; width: 100%; height: 100%` with `object-fit: cover`; retain this order so the cabin remains the focal point.
