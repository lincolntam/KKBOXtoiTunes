# KKBOXtoiTunes

KKBOXtoiTunes is a local web tool for copying KKBOX song metadata into an iTunes-friendly workflow.

Paste a KKBOX song URL, click **Read**, and the app fetches the page source through a local Python backend, extracts metadata, and fills copy-ready fields.

## Features

- Reads KKBOX song URLs through a local `/api/meta` backend endpoint
- Extracts song title, artist, album, year, release date, artwork URL, credits, source URL, and lyrics
- Copies each field individually
- Copies a combined export text
- Displays a 3D cover carousel with fixed side artwork and the current song cover in the center
- Provides a fallback parser for pasted page source or visible page text

## Run Locally

```bash
python server.py
```

Then open:

```text
http://127.0.0.1:4173
```

## Files

- `index.html` - app markup
- `style.css` - UI styling
- `app.js` - frontend logic and parser fallback
- `server.py` - local static server and KKBOX metadata API
- `assets/` - carousel artwork

## Notes

The backend only accepts KKBOX URLs. If KKBOX blocks or times out, paste the KKBOX page source into the fallback box and click **Parse pasted content**.
