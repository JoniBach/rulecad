# create-rulecad

```sh
npm create rulecad my-designs
cd my-designs
npx cad check home/soap-tray
```

Makes a [rulecad](https://github.com/JoniBach/rulecad) workspace with two designs to start from, every measurement a
variable that names its rule: a soap tray with ribs and drain slots, and a box with its lid screwed on. The box's
assembly (`npx cad check home/lidded-box`) says how the parts screw together with a `fasten`: the holes are drawn from
`v.fixings` by the thread's name, so no screw size is typed anywhere, and the check chooses each screw's length and
lists the screws (`npx cad list home/lidded-box`: 4 × M3x8 cap). `--no-install` makes the files without
running `npm install`. It asks how you'll share models: short links keep each shared model in a secret GitHub Gist
(needs the `gh` command, signed in); long links carry the model and upload nothing. `--share gist` or `--share long`
answers in advance (without either, and with no one to ask, links stay long).

## A machine to start from

```sh
npm create rulecad my-arm --machine arm --sheet a5 --accuracy 0.3
cd my-arm
npx cad check arm/arm
npx cad plot arm/arm projects/arm/drawings/test.svg
```

`--machine arm` also makes a two-link arm that draws: sized for a landscape A6, A5 or A4 sheet (`--sheet`, default A5) and an
accuracy at the pen (`--accuracy` in mm, default 0.3), with its task, bought items, wires, plates, a test drawing fitted to the
sheet, and the streamer for an Uno. `--machine leg` makes a leg on a test stand, for a robot of `--robot` kg (default 1.5). In a
terminal with neither given it asks; given a flag, or with no terminal, it uses the defaults without asking. The arm and the leg
are explained part by part in EXAMPLES chapters 12 and 14, and [the machines guide](https://jonibach.github.io/rulecad/docs/machines/)
walks the arm from task to drawing.

## A frame to start from

```sh
npm create rulecad my-frame --machine frame --size 300x300x350 --profile 2020-misumi-hfs5
cd my-frame
npx cad check frame/box
npx cad kit frame/box
```

`--machine frame` makes a box frame of aluminium extrusion in `projects/frame`, asked for by its inside size
(`--size`, width x depth x height in mm, each 50 to 2000; default 300x300x350) in one profile (`--profile`). Its
beams, joins, feet and end caps are generated from that each time it is built (`"frame": { "kind": "box" }` in
`projects/frame/assemblies/box.json`), with a 5 kg load on its top front beam to change to what it carries. Each
profile offered comes with the join and feet its box checks clean with, on a fresh install:

| `--profile` | Joins | Feet |
|---|---|---|
| `2020-misumi-hfs5` (the default) | blind: a screw in each butting beam's end, its head in the upright's slot | printed levelling feet |
| `2020-openbuilds` | blind | printed levelling feet |
| `3030-misumi-hfs6` | printed corner brackets on drop-in slot nuts | printed feet |

Another profile is refused by name, before anything is written: make the box in one of these and change its
`"profile"`, `"join"` and `"feet"` by hand, and `cad check` says what that needs. `npx cad kit frame/box` writes the
folder to build it from without the model: the build page, the shopping list, the plates to print, the jigs and each
beam's cut-and-drill sheet. It does not ask: with no `--size` or `--profile` it makes the default.
