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
