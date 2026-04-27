#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROOT, 'marketingskills', 'skills');
const OUT_FILE = join(ROOT, 'data', 'skills.json');

const CATEGORY_MAP = {
  'page-cro': 'CRO', 'signup-flow-cro': 'CRO', 'onboarding-cro': 'CRO',
  'form-cro': 'CRO', 'popup-cro': 'CRO', 'paywall-upgrade-cro': 'CRO',
  'copywriting': 'Content', 'copy-editing': 'Content', 'cold-email': 'Content',
  'email-sequence': 'Content', 'social-content': 'Content', 'image': 'Content',
  'video': 'Content', 'content-strategy': 'Content',
  'seo-audit': 'SEO', 'ai-seo': 'SEO', 'programmatic-seo': 'SEO',
  'site-architecture': 'SEO', 'schema-markup': 'SEO', 'aso-audit': 'SEO',
  'paid-ads': 'Paid', 'ad-creative': 'Paid',
  'analytics-tracking': 'Measurement', 'ab-test-setup': 'Measurement',
  'churn-prevention': 'Retention', 'community-marketing': 'Retention',
  'free-tool-strategy': 'Growth', 'referral-program': 'Growth', 'lead-magnets': 'Growth',
  'revops': 'Sales', 'sales-enablement': 'Sales',
  'competitor-alternatives': 'Sales', 'competitor-profiling': 'Sales',
  'directory-submissions': 'Sales', 'launch-strategy': 'Sales', 'pricing-strategy': 'Sales',
  'marketing-ideas': 'Strategy', 'marketing-psychology': 'Strategy',
  'customer-research': 'Strategy', 'product-marketing-context': 'Strategy',
};

function parseSkillFile(slug, content) {
  let name = slug;
  let description = '';
  let version = '';
  let body = content;

  const front = content.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/);
  if (front) {
    const frontMatter = front[1];
    body = front[2];

    const nameMatch = frontMatter.match(/^name:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = frontMatter.match(/^description:\s*([\s\S]+?)(?=\nversion:|\nmetadata:|$)/m);
    if (descMatch) description = descMatch[1].trim();

    const versionMatch = frontMatter.match(/version:\s*([0-9.]+)/);
    if (versionMatch) version = versionMatch[1].trim();
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;

  return {
    slug,
    name,
    description,
    version,
    category: CATEGORY_MAP[slug] || 'Other',
    body,
    wordCount,
  };
}

async function loadSkills() {
  let entries;
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[build-skills] No existe ${SKILLS_DIR}. ¿Inicializaste el submódulo? -> git submodule update --init --recursive`);
      process.exit(1);
    }
    throw err;
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(SKILLS_DIR, entry.name, 'SKILL.md');
    try {
      await stat(skillFile);
    } catch {
      continue;
    }
    const content = await readFile(skillFile, 'utf8');
    skills.push(parseSkillFile(entry.name, content));
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

async function main() {
  const skills = await loadSkills();
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(skills, null, 2), 'utf8');
  const totalWords = skills.reduce((sum, s) => sum + s.wordCount, 0);
  console.log(`[build-skills] ${skills.length} skills · ${totalWords.toLocaleString()} palabras → ${OUT_FILE}`);
}

main().catch(err => {
  console.error('[build-skills] error:', err);
  process.exit(1);
});
