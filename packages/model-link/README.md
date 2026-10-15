# @rulecad/model-link

Share a printable model as a link. The model is compressed into the URL's `#fragment`, which browsers never send to
the server, so a public web page can open a private design and nothing is uploaded. It also writes STL files, and 3MF
files in Bambu Studio's project layout with each part on its own filament (AMS) slot. No dependencies: it uses the
browser's own `CompressionStream`, which Node 18+ has too.

```js
import { fromParts, encode, decode, stl, threemf } from '@rulecad/model-link';

const model = {
  title: 'Soap tray', version: '1.0.0',
  ...fromParts([
    { name: 'tray', triangles },                                  // [[[x, y, z] ×3], …], mm, Z up
    { name: 'logo', triangles: logoTriangles, slot: 2 },          // printed in the AMS's second filament
  ]),
};
const link = `https://your-viewer.example/#m=${await encode(model)}`;

const back = await decode(link.split('#m=')[1]);
const stlBytes = stl(back);              // Uint8Array, binary STL
const zip = await threemf(back);         // Uint8Array, a .3mf (one object, two parts on slots 1 and 2)
```

- **Precision:** corners are snapped to a grid about 1/5000 of the model's size, and shared corners are stored once.
- **Many copies of one shape** (nine keycaps): `fromShapes()` stores each shape once and a transform per copy, and
  `decode()` expands them.
- **Safety:** links are data, never code. `decode()` checks the format and sizes (`LIMITS`), refuses damaged links,
  and refuses links from a newer format version.
- **Short links:** `parseHash(location.hash)` also reads `#s=<id>`, a GitHub Gist holding the data, and
  `fromGist(id)` fetches it without signing in.
- **The file says who made it:** `stl(m, keep, { generator })` and `threemf(m, keep, { generator })`; the default is
  `rulecad`.
- **Reproducible files:** a 3MF records the day it was made; `bambu3mf(objects, { date: '2026-10-14' })` fixes it, so
  the same model gives the same bytes.
- `bambu3mf([{ name, parts: [{ name, triangles, slot }] }])` writes a 3MF from triangles directly. It has been
  checked by loading the files back into Bambu Studio; other slicers read the same file as plain objects.
- `zip([[name, text], …])` writes a ZIP of text files, with the platform's own compression (no library).
