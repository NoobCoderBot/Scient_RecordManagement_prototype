# SCIEnT — Record Management Portal

A prototype frontend that registers GitHub repositories and logs their commit
history as records in a ledger-style dashboard.

## What's inside

```
scient-portal/
├── index.html          # Vite entry HTML
├── package.json         # dependencies (react, react-dom, lucide-react)
├── vite.config.js       # Vite + React plugin config
├── .gitignore
└── src/
    ├── main.jsx          # React root / entry point
    ├── App.jsx           # the whole portal ( UI)
    └── index.css         # base reset
```

## Setup

1. Unzip the project and open a terminal in the `scient-portal` folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open the printed local URL (usually `http://localhost:5173`) in your browser.

## Notes

- This is a frontend-only prototype. It reads commit history live from
  GitHub's public REST API (`api.github.com`) — no GitHub auth/token is
  required for **public** repositories.
- "New commit" detection is simulated via polling (a manual refresh button,
  plus an automatic check every 45 seconds for the selected repo) rather than
  a real GitHub webhook, since a static frontend can't receive incoming
  webhooks. See the ideation document for the production architecture
  (backend + webhook receiver + database) that would replace this.
- All data is kept in memory only — refreshing the page clears the ledger.

## Build for production

```bash
npm run build
```

Outputs static files to `dist/`, which you can deploy to any static host
(Vercel, Netlify, GitHub Pages, etc.) — keeping in mind the persistence
caveat above.
