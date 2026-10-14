# @rulecad/versions

Semver for physical parts. For software, a major version means "your code may break". For a printed part it means
**"an earlier print may no longer fit"**. So the version follows the part's *interface*: the measurements other parts
depend on, like a keycap's stem slot or a case's screw holes.

| Change | Bump |
|---|---|
| An interface value changed or went away; a named variant changed | **major**: old prints may not fit |
| A new interface value, option, variant or tweak range | **minor**: nothing that fitted stops fitting |
| Anything else: tolerances that aren't interface, the shape's code, a rule's value, print settings | **patch** |

```js
import { compare, bump } from '@rulecad/versions';
import { resolve } from '@rulecad/variables';

const snapshot = (object, js) => ({ object, entries: resolve(object).entries, js });
const before = snapshot({ variables: { slot: { value: 4.2, interface: true } } }, shapeCode);
const after  = snapshot({ variables: { slot: { value: 4.25, interface: true } } }, shapeCode);

compare(before, after)   // { kind: 'major', reasons: [{ kind: 'major', text: 'interface slot 4.2 → 4.25' }] }
bump('1.4.2', 'major')   // '2.0.0'
```

Every reason is a short line you can put straight into a changelog. Where releases are kept is up to you (git tags,
files, a database): this package only reads and compares.

`satisfies(version, range)` handles `^1.2.0`, `~1.2.0` and `1.2.0`, so an assembly can say which versions of a part it
takes. One difference from npm: `^0.2.0` accepts `0.3.0`, because here a minor release never breaks a fit, even before
1.0. Also exported: `parse`, `newer` and `bigger`.
