# docs

The libraries' documentation site, published beside the model page at https://jonibach.github.io/rulecad/docs/.

- `build.mjs` makes it: a page for each package (what it's for, how to install it, a demonstration, and its README as
  the reference) and an index. The packages that run in a browser are demonstrated live with their own code (copied
  into the site with JSCAD's browser build, joined by an import map); the rest are shown with real output made at
  build time: boards from @rulecad/pcb, a project from create-rulecad, and `cad check`, `cad rules`, `cad preview`
  and `cad link` on it.
- `md.mjs` turns the READMEs into HTML (no dependency).
- `src/` holds the style, the 3D stage the demos share, and one demo module per package.

```sh
npm run docs                               # builds the model page and the docs into docs/_site
npx serve docs/_site                       # then open /docs/
node --test test/docs.browser.mjs          # every page in headless Chrome: no script errors, every demo draws
```

The pages workflow builds and deploys it from main whenever a package or the docs change.
