---
name: sync-github-projects
description: Detect new public GitHub repos that are not yet in the portfolio and add the ones the user picks as project cards/landings. Use when the user says "sync GitHub projects", "detect new projects", "revisa mis repos", "add this repo to the portfolio", or runs /sync-projects.
---

# sync-github-projects

Detect new repositories for the portfolio owner, compare them against `projects.json`, and walk the user through adding the ones they choose.

## When to use

- User asks to review their GitHub repos for portfolio candidates
- User runs `/sync-projects` or says "sync my GitHub projects"
- User wants to add a specific repo to the portfolio

## When NOT to use

- Syncing an existing project landing → use the `sync-landing` skill
- Creating a landing page for a project the user already picked → `sync-landing` first, then this skill only for the `projects.json` entry

## Step 1 — Detect new repos

Run the checker from the repo root:

```bash
node .opencode/skills/sync-github-projects/scripts/check-projects.mjs
```

Options:

- `--owner <login>` — defaults to `pochojordan`
- `--json` — machine-readable output
- `--include-forks` / `--include-archived` — include repos normally skipped

The script lists public repos, excludes the `portfolio` repo, forks, and archived repos by default, and marks a repo as new when its slug is missing from `projects.json` **and** there is no local `<slug>/index.html`.

## Step 2 — Let the user choose

Show the NEW list with slug, language, description and demo URL (GitHub Pages is auto-detected). **Never add every repo automatically.** Ask which ones to add; multiple selection is fine.

If there are no new repos, say so and stop.

## Step 3 — Gather context per chosen repo

For each chosen repo:

1. `gh repo view <owner>/<repo> --json description,homepageUrl,primaryLanguage,repositoryTopics,url`
2. Read the README when it exists: `gh api repos/<owner>/<repo>/readme --jq .content | base64 -d`
3. If the repo has `docs/index.html`, prefer the `sync-landing` flow so the landing keeps the shared design line.

## Step 4 — Decide the card URL

Use the first matching option:

1. Local landing exists or was just synced → `./<slug>/`
2. GitHub Pages is live and the app is demo-ready → external Pages URL (e.g. `https://pochojordan.github.io/<repo>/`)
3. Otherwise → the repo URL

Ask the user when it is ambiguous; do not silently link to a broken demo.

## Step 5 — Propose the `projects.json` entry

Draft the full entry and get confirmation before writing:

```json
{
  "slug": "<kebab-case>",
  "color": "#RRGGBB",
  "tags": ["Tag1", "Tag2"],
  "url": "./<slug>/",
  "title": { "en": "...", "es": "..." },
  "subtitle": { "en": "...", "es": "..." },
  "description": { "en": "...", "es": "..." }
}
```

Rules:

- Bilingual EN/ES, concise (description ≤ 2 sentences)
- 3–5 tags, reuse names already present in `projects.json` (AI, Multi-Agent, TypeScript, Firebase, JavaScript, HTML…) plus one product-specific tag
- Unique accent color; do not reuse `#6366f1` or `#8257e5` unless intentional
- Append the entry at the end of the array, preserving the existing formatting (2 spaces, inline tag/title arrays)

## Step 6 — Verify

1. `node -e "JSON.parse(require('fs').readFileSync('projects.json','utf8'))"`
2. Serve locally (`python3 -m http.server 8765`) and check the `#grid` card count equals the entry count, with no console errors
3. Report what changed and ask before committing/pushing (git actions always need explicit approval)

## Constraints

- Read-only GitHub access by default: never push to the project repos
- Never remove or reorder existing `projects.json` entries
- Never commit or push without explicit confirmation
- Keep `projects.json` valid JSON at every step

## Files

- `.opencode/skills/sync-github-projects/scripts/check-projects.mjs` — detection script
- `projects.json` — card data
- `shared.css` / `nav.js` — import only, never modified by this skill
