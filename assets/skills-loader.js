const STOPWORDS = new Set([
  'a','al','algo','algun','alguna','algunas','algunos','ante','antes','aqui','asi','ay',
  'como','con','contra','cual','cuales','cuando','de','del','desde','donde','dos',
  'el','ella','ellas','ellos','en','entre','era','eras','es','esa','esas','ese','eso',
  'esos','esta','estas','este','esto','estos','estoy','fue','fui','ha','han','has','hay',
  'la','las','le','les','lo','los','mas','me','mi','mis','muy','nada','ni','no','nos',
  'nuestra','nuestro','o','os','para','pero','poco','por','porque','que','quien','quiero',
  'se','sea','ser','si','sin','sobre','solo','son','soy','su','sus','tan','te','tener',
  'ti','tiene','toda','todas','todo','todos','tu','tus','un','una','uno','unos','y','ya','yo',
  'the','of','to','for','and','or','but','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','should','could','can','may',
  'i','you','he','she','it','we','they','my','your','his','her','our','their',
  'this','that','these','those','what','when','where','who','why','how','if','then',
  'with','from','about','into','through','during','before','after','above','below',
  'page','user','use','also','want','wants','help','need','using','make','create',
  'mentions','says','asks','include','gets','give',
]);

export async function loadSkills() {
  const res = await fetch('./data/skills.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se pudo cargar skills.json (HTTP ${res.status})`);
  return res.json();
}

export function tokenize(text) {
  const lower = (text || '').toLowerCase();
  const cleaned = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = cleaned.split(/\s+/);
  const seen = new Set();
  for (const t of tokens) {
    if (!t || t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    seen.add(t);
  }
  return [...seen];
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

export function scoreSkills(userText, skills) {
  const userTokens = tokenize(userText);
  if (userTokens.length === 0) return [];

  const scored = [];
  for (const skill of skills) {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase();
    const nameLower = skill.name.toLowerCase();
    let score = 0;
    const matches = new Set();
    for (const token of userTokens) {
      const count = countOccurrences(haystack, token);
      if (count > 0) {
        score += count;
        matches.add(token);
      }
    }
    for (const token of userTokens) {
      if (nameLower.includes(token)) score += 5;
    }
    if (score > 0) {
      scored.push({ skill, score, matches: [...matches] });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function categoriesByCount(skills) {
  const counts = {};
  for (const s of skills) {
    counts[s.category] = (counts[s.category] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
