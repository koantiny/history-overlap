# Contemporaries

A static web app that shows which notable historical figures were alive at the same time as a given person.

Inspired by “these famous people were alive at the same time” memes.

**No Node, no build step, no backend.** Open the files with any static file server (or GitHub Pages).

## Features (MVP)

- Search historical figures via Wikidata
- Disambiguation when multiple people match
- Hero card with portrait, years, and Wikipedia summary
- Grid of contemporaries ranked by notability (Wikidata sitelinks)
- Click any contemporary to promote them to the hero
- Shareable deep links (`?id=Q7207`)
- Responsive, dark-mode friendly UI

## Run locally

Browsers block ES modules from `file://`, so serve the folder over HTTP:

```bash
# Python (usually already installed on Linux/macOS)
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Any other static server works the same way (`ruby -run -ehttpd . -p8080`, Caddy, nginx, etc.).

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → Deploy from branch → `main` / root (or `/docs` if you prefer).
3. Done. No build job required.

## Project layout

```
index.html          # shell
css/styles.css      # layout + dark mode
js/main.js          # app wiring
js/api/wikidata.js  # search + SPARQL
js/api/wikipedia.js # page summaries
js/ui/render.js     # DOM rendering
```

## Data sources

| Need | Source |
|------|--------|
| Name search | Wikidata `wbsearchentities` |
| Birth/death, image, ranking | Wikidata SPARQL |
| Biography text & portraits | Wikipedia REST summary API |

Contemporaries must have overlapping lifespans with the selected person and at least 25 Wikidata sitelinks. Results are capped at 40 and ordered by sitelinks descending.

## License

GPL-3.0 — see [LICENSE](LICENSE).
