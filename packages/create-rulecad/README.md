# create-rulecad

```sh
npm create rulecad my-designs
cd my-designs
npx cad check home/soap-tray
```

Makes a [rulecad](https://github.com/JoniBach/rulecad) workspace with one design to start from: a soap tray with
ribs and drain slots, every measurement a variable that names its rule. `--no-install` makes the files without
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
