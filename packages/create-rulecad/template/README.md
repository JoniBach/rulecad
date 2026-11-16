# NAME

Designs for 3D printing, made with [rulecad](https://github.com/JoniBach/rulecad). Every measurement is a variable,
and every variable says where it comes from.

```sh
npx cad check home/soap-tray                    # is it printable? (and: no raw numbers in the design)
npx cad check home/soap-tray --set length=140   # try another size (each tweakable variable has a range)
npx cad preview home/soap-tray                  # six views, in .preview/
npx cad export home/soap-tray                   # a 3MF for your slicer, in exports/
npx cad link home/soap-tray --md                # a link that opens the model in a browser: nothing is uploaded
npx cad new home/hook                           # your own design
```

A second example is a box with its lid screwed on:

```sh
npx cad check home/lidded-box                   # the lid on the box, and each screw followed through its holes
npx cad list home/lidded-box                    # what to buy: 4 × M3x8 cap, the length the check chose
npx cad order home/lidded-box                   # how it goes together, with the key that turns the screws
```

- `projects/home/objects/box.js` and `lid.js` draw the screws' holes with `v.fixings`, named by the thread (`'M3'`):
  the pilot in each corner post and the clearance hole in the lid are sized from the thread's rule set and your
  printer's, so no screw size is typed. `projects/home/assemblies/lidded-box.json` says how they screw together with
  a `fasten`: the screw by thread and head (`M3 cap`), the part it passes and the part it ends in.

- `projects/home/objects/soap-tray.json` holds the variables, `soap-tray.js` the shape ([JSCAD](https://openjscad.xyz)).
  Assemblies, in `projects/home/assemblies/`, place objects together and check how they fit and fasten.
- `rules/` holds the facts designs use, such as your printer's (`x1c.json`, copied in on first use). Measure your own
  printer and correct them: every design that uses them follows.
- `cad.config.json` names the printer. For another printer, copy `rules/x1c.json` under a new name and change the
  values.
- `AGENTS.md` tells an AI agent (Claude Code and others) how to design here: rules first, look at the preview,
  report fits with numbers. `CLAUDE.md` includes it.
