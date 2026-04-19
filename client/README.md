# Frontend Workspace

This Vite app renders the HKU-style enrollment system UI.

Key files:

- `src/App.jsx`: portal shell and page composition
- `src/usePortalController.js`: portal state, async actions, and global interaction flow
- `src/portalModel.js`: shared UI constants, state mapping, and dialog/preview helpers
- `src/api.js`: frontend API wrapper for the enrollment backend
- `src/pages/`: page-level views for announcement, manage courses, results, and cancel flows
- `src/components/`: shared portal widgets and modal/feedback components
- `src/index.css`: style entry file that imports the portal style layers
- `src/styles/`: split CSS layers for base, layout, data/table states, feedback, and responsive rules
