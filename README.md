# FreeCoffee — public download site + releases

This repo is the **public distribution surface** for FreeCoffee: the
marketing/demo site (served at https://freecoffee.tech via GitHub Pages)
and the Mac app releases (`.dmg`).

The source code lives in a private development repository. This repo
contains only built/published artifacts:

- `*.html`, `assets/`, `sw.js`, `manifest.webmanifest`, `CNAME` — the site
- `app/Info-howto.md` — install + privacy docs (dev-only sections removed)
- `feeds/` — sample + template campaign feeds
- GitHub Releases — `FreeCoffee.dmg` per version + checksums in the notes

Verify a download: `shasum -a 256 FreeCoffee.dmg` against the `SHA256:`
line in the release notes. Or skip Gatekeeper dialogs entirely:

```sh
brew tap ayodhyamohanthy/freecoffee https://github.com/ayodhyamohanthy/freecoffee-tap
brew install --cask ayodhyamohanthy/freecoffee/freecoffee
```

FreeCoffee demo — simulated data.
