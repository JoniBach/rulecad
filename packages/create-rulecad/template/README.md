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

- `projects/home/objects/soap-tray.json` holds the variables, `soap-tray.js` the shape ([JSCAD](https://openjscad.xyz)).
- `rules/` holds the facts designs use, such as your printer's (`x1c.json`, copied in on first use). Measure your own
  printer and correct them: every design that uses them follows.
- `cad.config.json` names the printer. For another printer, copy `rules/x1c.json` under a new name and change the
  values.
