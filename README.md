# Weekly Habit Tracker

An offline-first, mobile-friendly habit tracker PWA for iPhone and desktop browsers.

## Features

- Weekly planner layout with Monday-start weeks
- Local-only habit storage in the browser
- Copy weeks forward to reuse your habit list
- Export/import JSON backup
- Installable as a PWA on iPhone
- Public GitHub Pages hosting

## Local development

Serve this folder with any static server. For example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Notes

- Habit data stays local on the device.
- Use Export Backup before switching devices or clearing browser data.
- The 404 page redirects users back to the app root and keeps the same neon-nightclub style.
