# 3D models

The parts' 3D models, fetched by `cad clone` and turned into meshes (JSON triangles, mm).

- **`kicad/`:** from [KiCad's 3D model library](https://gitlab.com/kicad/libraries/kicad-packages3D) (6.0.11).
  Licensed under CC-BY-SA 4.0, with KiCad's exception: designs using the models, and files made from those designs,
  aren't bound by the licence. Each file records its source.
- **Not here:** Sea-Picro's own models for the USB-C socket, the RP2040 and the PTC fuse come from Josh Johnson's
  [josh-kicad-lib](https://github.com/joshajohnson/josh-kicad-lib), which has no licence. Only their sizes are used
  (in `rules/sea_picro.json`), and they're drawn as boxes.
