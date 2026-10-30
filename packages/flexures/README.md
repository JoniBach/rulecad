# @rulecad/flexures

Compliant mechanisms for printed parts: flexures that move by bending instead of turning on a pin. Each one is a
JSCAD shape and a model: its stiffness, the strain its material sees at a travel, and the travel a strain allows.
No dependencies but JSCAD. Part of [rulecad](https://github.com/JoniBach/rulecad).

```js
import { leaf, leafModel, parallelGuide, parallelGuideModel, serpentine, notchHinge, notchHingeModel, printable } from '@rulecad/flexures';

const spring = { length: 40, thickness: 1.26, width: 8 };          // mm: along x, bending along y, width up z
const pla = { E: 2680, strainLimit: 0.02, name: 'PLA' };           // MPa, and the strain it may see
const m = leafModel(spring, pla);
m.stiffness;        // 0.084 N/mm
m.travel(0.02);     // 16.9 mm: how far before 2% strain
m.strain(5);        // 0.0059 at 5 mm
leaf(spring);       // the shape

printable({ ...spring, travel: 5 }, { line: 0.42, layer: 0.2, wall_min: 0.84 }, pla, m);
// [{ level: 'pass', text: '1.26 mm thick: 3 lines of 0.42 mm', code: 'flexure.lines' }, { level: 'pass', text: 'at 5 mm of travel the material sees 0.59% strain, within PLA limit of 2.0%', ... }]
```

## The flexures

| | Shape | Stiffness | Strain at travel δ |
|---|---|---|---|
| `leaf` | A cantilever: fixed at one end, pushed at the tip | E w t³ / 4L³ | 3tδ / 2L² |
| `fixedGuided` | Fixed at one end, the other moved without turning | E w t³ / L³ | 3tδ / L² |
| `parallelGuide` | Two fixed-guided leaves and a shuttle: a linear bearing with no parts | 2 E w t³ / L³ | 3tδ / L²; the shuttle drops 3δ² / 5L |
| `serpentine` | n leaves end to end, zigzagging: a long spring in a short space | E w t³ / nL³ | 3t(δ/n) / L² |
| `notchHinge` | A thin neck between two round notches: a pivot with no play | 2 E w t^(5/2) / 9π√R, N·mm a radian | 4θ√(t/R) / 3π, times about 1.2 for the notch |

L length, t thickness (across the bend), w width (up the print), R a notch's radius, θ an angle in radians. Each
`<name>Model(shape, material)` gives `stiffness`, `strain(travel)`, `travel(strain)` and `stress(travel)`; the notch
hinge's are in angles.

## Printed flat

Every flexure is drawn with its length along x, bending along y, and its width up z. Printed that way, it bends
within its layers, where the filament's own strength is. A flexure that bends across its layers pulls them apart,
and that's the one that snaps.

`printable(shape, printer, material, model)` says how it prints, as findings like `@rulecad/printcheck`'s: the
thickness in whole extrusion lines (and at least two of them: `line` and `wall_min` from the printer's rules), the
width in whole layers, and the strain at the travel against the material's `strainLimit`.

## What the models are good for

Beam theory and the pseudo-rigid-body model, good while a flexure's travel is a few times its thickness. Past that,
a leaf shortens as it bends and the numbers drift; a nonlinear model is on the roadmap. The material's strain limit
is yours to set: PLA is brittle and creeps when held bent; PETG and nylon last far longer; living hinges want TPU or
polypropylene. Measured limits, with their sources, belong in the material's rule set.

## Sources

- Howell, L. L., *Compliant Mechanisms*, Wiley, 2001: the pseudo-rigid-body model, the fixed-guided beam, the
  parallel guide's drop.
- Smith, S. T., *Flexures: Elements of Elastic Mechanisms*, CRC Press, 2000: notch hinges and their stress.
- Paros, J. M., and Weisbord, L., "How to design flexure hinges", *Machine Design*, 1965: the notch hinge's stiffness.
