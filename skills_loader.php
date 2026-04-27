<?php
function load_skills() {
    $skillsDir = __DIR__ . '/marketingskills/skills';
    $skills = [];

    if (!is_dir($skillsDir)) return $skills;

    $categoryMap = [
        'page-cro' => 'CRO', 'signup-flow-cro' => 'CRO', 'onboarding-cro' => 'CRO',
        'form-cro' => 'CRO', 'popup-cro' => 'CRO', 'paywall-upgrade-cro' => 'CRO',
        'copywriting' => 'Content', 'copy-editing' => 'Content', 'cold-email' => 'Content',
        'email-sequence' => 'Content', 'social-content' => 'Content', 'image' => 'Content',
        'video' => 'Content', 'content-strategy' => 'Content',
        'seo-audit' => 'SEO', 'ai-seo' => 'SEO', 'programmatic-seo' => 'SEO',
        'site-architecture' => 'SEO', 'schema-markup' => 'SEO', 'aso-audit' => 'SEO',
        'paid-ads' => 'Paid', 'ad-creative' => 'Paid',
        'analytics-tracking' => 'Measurement', 'ab-test-setup' => 'Measurement',
        'churn-prevention' => 'Retention', 'community-marketing' => 'Retention',
        'free-tool-strategy' => 'Growth', 'referral-program' => 'Growth', 'lead-magnets' => 'Growth',
        'revops' => 'Sales', 'sales-enablement' => 'Sales',
        'competitor-alternatives' => 'Sales', 'competitor-profiling' => 'Sales',
        'directory-submissions' => 'Sales', 'launch-strategy' => 'Sales', 'pricing-strategy' => 'Sales',
        'marketing-ideas' => 'Strategy', 'marketing-psychology' => 'Strategy',
        'customer-research' => 'Strategy', 'product-marketing-context' => 'Strategy',
    ];

    foreach (scandir($skillsDir) as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $skillFile = $skillsDir . '/' . $entry . '/SKILL.md';
        if (!is_file($skillFile)) continue;

        $content = file_get_contents($skillFile);
        $name = $entry;
        $description = '';
        $version = '';
        $body = $content;

        if (preg_match('/^---\s*(.*?)\s*---\s*(.*)$/s', $content, $m)) {
            $front = $m[1];
            $body = $m[2];
            if (preg_match('/^name:\s*(.+)$/m', $front, $mm)) $name = trim($mm[1]);
            if (preg_match('/^description:\s*(.+)$/ms', $front, $mm)) {
                $description = trim(preg_split('/\nversion:|\nmetadata:/', $mm[1])[0]);
            }
            if (preg_match('/version:\s*([0-9.]+)/', $front, $mm)) $version = trim($mm[1]);
        }

        $skills[] = [
            'slug' => $entry,
            'name' => $name,
            'description' => $description,
            'version' => $version,
            'category' => isset($categoryMap[$entry]) ? $categoryMap[$entry] : 'Other',
            'body' => $body,
            'wordCount' => str_word_count(strip_tags($body)),
        ];
    }

    usort($skills, function($a, $b) { return strcmp($a['name'], $b['name']); });
    return $skills;
}

function tokenize($text) {
    $text = mb_strtolower($text, 'UTF-8');
    $text = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $text);
    $tokens = preg_split('/\s+/', trim($text));

    $stopwords = [
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
        'mentions','says','asks','also','include','using','using','gets','give'
    ];
    $stop = array_flip($stopwords);
    $out = [];
    foreach ($tokens as $t) {
        if ($t === '' || mb_strlen($t) < 3) continue;
        if (isset($stop[$t])) continue;
        $out[$t] = true;
    }
    return array_keys($out);
}

function score_skills($userText, $skills) {
    $userTokens = tokenize($userText);
    if (empty($userTokens)) return [];

    $scored = [];
    foreach ($skills as $s) {
        $haystack = mb_strtolower($s['name'].' '.$s['description'], 'UTF-8');
        $score = 0;
        $matches = [];
        foreach ($userTokens as $t) {
            $count = mb_substr_count($haystack, $t);
            if ($count > 0) {
                $score += $count;
                $matches[] = $t;
            }
        }
        $nameLower = mb_strtolower($s['name'], 'UTF-8');
        foreach ($userTokens as $t) {
            if (mb_strpos($nameLower, $t) !== false) $score += 5;
        }
        if ($score > 0) {
            $scored[] = ['skill' => $s, 'score' => $score, 'matches' => array_values(array_unique($matches))];
        }
    }
    usort($scored, function($a, $b) { return $b['score'] - $a['score']; });
    return $scored;
}
