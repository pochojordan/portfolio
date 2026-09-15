---
name: sync-landing
description: Sync a project's landing page into the portfolio. Use when the user says sync a landing, run /sync-landing, or wants to add/update a project landing from ~/Projects/<name>/docs/index.html.
---

# sync-landing

Sync a specific project's landing into the portfolio, modifying the project files.

## When to use
- User runs `/sync-landing <project>` or asks to sync a specific project's landing
- Example: `/sync-landing factoryHarness` or `/sync-landing clickup-board`

## Steps (single project)

1. **Find the source landing** at `~/Projects/<name>/docs/index.html`. If not found, ask the user.

2. **Create directory** `portfolio/<slug>/` if it doesn't exist. Slug = lowercase with hyphens (e.g. `factoryHarness` → `factory-harness`).

3. **Copy and adapt the landing** to `portfolio/<slug>/index.html`:
   - Add `../shared.css` link in `<head>` (remove duplicate base styles already in shared.css)
   - Add `<script src="../nav.js"></script>` before the closing `</body>` or before module scripts
   - Keep project-specific styles, Three.js scenes, and content
   - Ensure loader id is `ld` (`<div class="loader" id="ld">`)
   - Add `setTimeout(() => document.getElementById('ld').classList.add('off'), 400)` at end of script

4. **Update `projects.json`**: add or update the entry:
   ```json
   {
     "slug": "<slug>",
     "color": "#6366f1",
     "tags": ["Tag1", "Tag2"],
     "url": "./<slug>/",
     "title": { "en": "...", "es": "..." },
     "subtitle": { "en": "...", "es": "..." },
     "description": { "en": "...", "es": "..." }
   }
   ```
   Ask the user for color, tags, and descriptions if it's a new project.

5. **Verify** the gallery card will render: check that `projects.json` entry has all required fields.

## Sync all (only if explicitly asked)

Scans `~/Projects/*/docs/index.html` and runs the above steps for each.

## Files modified
- `portfolio/<slug>/index.html` — created/updated (the landing)
- `projects.json` — entry added/updated
- `shared.css` and `nav.js` — NOT modified, only imported

## Design philosophy

All landings share the same design line via `shared.css` (dark cyberpunk, Space Grotesk, neon glow, additive blending). But each project has its own personality:

- Some projects need **charts/graphs** (data-heavy)
- Some need **more text** (documentation-style)
- Some need **video embeds** (demos, walkthroughs)
- Some need **interactive demos** (Three.js, canvas, etc.)
- Some need **image galleries** (screenshots, mockups)

The agent should analyze the source landing and preserve whatever content type maximizes the project's impact. The design line (colors, typography, spacing, nav, loader, buttons, tags) always comes from `shared.css`. Project-specific styles go in the `<style>` block of each landing.

**Rule**: shared.css provides the base. Each project adds what it needs on top. Never strip unique content to force uniformity.

## Constraints
- Never overwrite a landing without asking first (unless user said "force")
- Preserve existing entries in projects.json — only add or update, never remove
- Keep tags consistent (reuse existing tag names when possible)
- If project has no landing yet, tell the user and offer to create one from the template in shared.css conventions
