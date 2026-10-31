# @rulecad/viewer

A model page you can host anywhere, as plain static files: no server code, no build, no accounts. Try it at
[jonibach.github.io/rulecad](https://jonibach.github.io/rulecad/): drop an STL on it.

- **Open a model link** (`#m=…`, made by `cad link` or `@rulecad/model-link`): the model turns slowly, and you can
  drag to turn it yourself. A parts panel shows, hides and restyles each part and ticks the ones a download holds.
  Downloads are STL, or 3MF in Bambu Studio's layout with each part on its filament slot.
- **On a phone:** the model and an info pane share the screen, with the model on top in portrait and on the left in
  landscape, so nothing covers it. The Parts button swaps the parts panel into the pane, and the rules sheet opens
  there too. Drag the grip between the two to change how the screen is shared (it's remembered), or double tap it
  to go back to half and half.
- **Things that move:** a link with joints (a `cad` assembly with joints and poses) gets a Motion panel. It has a
  slider for each joint, a button for each pose, and, when you let a slider go, a quick look for parts pushed into
  each other.
- **Sliced as the printer builds it:** the Slice panel has a layer slider. Everything above the layer is cut away and
  its outline drawn, so you can step up through the part from the bed. Off the page's thread, every layer is checked
  against the one below (`islands()` in `@rulecad/printcheck`). An island, a region with nothing under it that the
  printer would lay on air, shows in red over the model, with a button that jumps the slider to it. The layer height,
  overhang limit and line width come from the link's rules when it has them, and otherwise 0.2 mm, 45° and 0.42 mm.
- **Or drop an STL file on it**: the page draws it, checks it for printing (bed, flat base, overhangs, bridges,
  closed solid; `@rulecad/printcheck`), and turns the address into a link that holds the model, ready to share.
- **Nothing is uploaded.** The model lives in the link's `#fragment`, which browsers never send to the web host, so a
  public page can open private designs. Links are read as data, never run as code. (Short links, `#s=<id>`, fetch
  their data from a GitHub Gist.)

## Host your own

The page is the `site/` folder. Copy it anywhere that serves files:

```sh
npm pack @rulecad/viewer && tar xzf rulecad-viewer-*.tgz   # package/site/ is the page
```

- **GitHub Pages:** put the files of `site/` in a repository and turn on Pages (Settings → Pages → deploy from
  branch). `site/` already has the `.nojekyll` file that makes Pages serve the files as they are.
- **Anything else:** Netlify, Cloudflare Pages, a Raspberry Pi running `python3 -m http.server`. It needs no headers
  or rewrites, just a `.mjs` file served as JavaScript.
- Then point `cad` at it: `"viewUrl": "https://you.github.io/models/"` in your `cad.config.json`.

## Working on it

`site/view.mjs` is the page and `site/index.html` its layout and styles. `node scripts/build.mjs` copies the link
format and the print check in beside them (`--three` rebuilds the trimmed three.js after a name is added to its
list). `node --test test/viewer.browser.mjs` from the repository root drops an STL into the page in headless Chrome
and saves screenshots.

three.js (MIT, `site/three.LICENSE`) draws the model.
