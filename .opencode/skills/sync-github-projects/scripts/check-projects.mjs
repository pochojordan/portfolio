#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROJECTS = path.join(ROOT, 'projects.json');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const owner = flag('--owner', 'pochojordan');
const asJson = args.includes('--json');
const includeForks = args.includes('--include-forks');
const includeArchived = args.includes('--include-archived');

function gh(repoArgs) {
  return execFileSync('gh', repoArgs, { encoding: 'utf8' }).trim();
}

function slugify(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase();
}

function demoUrl(ownerName, repo) {
  try {
    return execFileSync('gh', ['api', `repos/${ownerName}/${repo}/pages`, '--jq', '.html_url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

let projects = [];
try {
  projects = JSON.parse(readFileSync(PROJECTS, 'utf8'));
} catch (err) {
  console.error(`Could not read ${PROJECTS}: ${err.message}`);
  process.exit(1);
}

const knownSlugs = new Set(projects.map((p) => p.slug));

let repos;
try {
  repos = JSON.parse(
    gh([
      'repo', 'list', owner, '--limit', '200',
      '--json', 'name,description,url,homepageUrl,isPrivate,isFork,isArchived,primaryLanguage,pushedAt',
    ])
  );
} catch (err) {
  console.error('gh repo list failed. Check that GitHub CLI is installed and authenticated.');
  console.error(String(err.stderr || err.message).trim());
  process.exit(1);
}

const known = [];
const fresh = [];

for (const repo of repos) {
  if (repo.isPrivate) continue;
  if (repo.isFork && !includeForks) continue;
  if (repo.isArchived && !includeArchived) continue;
  if (repo.name.toLowerCase() === 'portfolio') continue;

  const slug = slugify(repo.name);
  const entry = {
    repo: repo.name,
    slug,
    description: repo.description || '',
    language: repo.primaryLanguage?.name || '',
    repoUrl: repo.url,
    homepage: repo.homepageUrl || '',
    pushedAt: repo.pushedAt || '',
  };

  if (knownSlugs.has(slug)) {
    known.push(entry);
    continue;
  }

  const landing = existsSync(path.join(ROOT, slug, 'index.html'));
  fresh.push({ ...entry, landing, demo: landing ? '' : demoUrl(owner, repo.name) });
}

if (asJson) {
  console.log(JSON.stringify({ owner, total: repos.length, new: fresh, known }, null, 2));
  process.exit(0);
}

console.log(`${owner} — ${repos.length} repos · ${fresh.length} new\n`);

if (!fresh.length) {
  console.log('No new projects. Nothing to add.');
} else {
  console.log('NEW');
  for (const r of fresh) {
    const link = r.landing ? 'local landing' : r.demo || r.homepage || r.repoUrl;
    console.log(`  ${r.slug}  ${r.language || '-'}`);
    if (r.description) console.log(`    ${r.description}`);
    console.log(`    ${link}`);
  }
}

if (known.length) {
  console.log('\nALREADY IN PORTFOLIO');
  for (const r of known) console.log(`  ${r.repo} -> ${r.slug}`);
}
