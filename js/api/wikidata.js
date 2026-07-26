/**
 * Wikidata API helpers: entity search + SPARQL for person data and contemporaries.
 */

const WD_API = 'https://www.wikidata.org/w/api.php';
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// Spec suggests ≥20–25; 25 keeps results notable while staying query-friendly.
const SITELINKS_MIN = 25;
const CONTEMPORARIES_LIMIT = 40;

/**
 * Build an xsd:dateTime literal for SPARQL date filters.
 * Handles BCE years (negative).
 * @param {number} year
 * @param {'start'|'end'} bound
 */
function yearToXsdDate(year, bound = 'start') {
  const abs = Math.abs(year);
  // Wikidata uses signed years; pad to at least 4 digits (6 for large BCE).
  const digits = abs >= 10000 ? String(abs) : String(abs).padStart(year < 0 ? 6 : 4, '0');
  const y = year < 0 ? `-${digits}` : digits;
  return bound === 'end' ? `${y}-12-31T23:59:59Z` : `${y}-01-01T00:00:00Z`;
}

/**
 * Prefer a real Wikidata timestamp; fall back to year bounds.
 * @param {string|null} raw
 * @param {number|null} year
 * @param {'start'|'end'} bound
 */
function sparqlDateLiteral(raw, year, bound) {
  if (raw) {
    // Wikidata timestamps look like "+1630-06-08T00:00:00Z" or "-0044-03-15T00:00:00Z"
    let cleaned = String(raw).trim();
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (/^-?\d{1,8}-\d{2}-\d{2}/.test(cleaned)) {
      const iso = cleaned.includes('T') ? cleaned : `${cleaned}T00:00:00Z`;
      return `"${iso}"^^xsd:dateTime`;
    }
  }
  if (year == null) return null;
  return `"${yearToXsdDate(year, bound)}"^^xsd:dateTime`;
}

/**
 * Search people (and entities) by name via wbsearchentities.
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<Array<{ id: string, label: string, description: string }>>}
 */
export async function searchEntities(query, limit = 10) {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: String(limit),
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`${WD_API}?${params}`);
  if (!res.ok) {
    throw new Error(`Wikidata search failed (${res.status})`);
  }

  const data = await res.json();
  return (data.search || []).map((item) => ({
    id: item.id,
    label: item.label || item.id,
    description: item.description || '',
  }));
}

/**
 * Run a SPARQL query against the Wikidata Query Service.
 * @param {string} sparql
 * @returns {Promise<object[]>}
 */
async function runSparql(sparql) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'ContemporariesApp/0.1 (static educational demo)',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `SPARQL query failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
    );
  }

  const data = await res.json();
  return data.results?.bindings || [];
}

function bindingValue(row, key) {
  return row[key]?.value ?? null;
}

function parseYear(isoOrDate) {
  if (!isoOrDate) return null;
  // Wikidata dates look like "+1630-05-29T00:00:00Z" or year-only forms
  const m = String(isoOrDate).match(/([+-]?\d{1,6})-/);
  if (m) return parseInt(m[1], 10);
  const y = parseInt(String(isoOrDate).slice(0, 5), 10);
  return Number.isFinite(y) ? y : null;
}

function commonsImageUrl(fileUrlOrName, width = 400) {
  if (!fileUrlOrName) return null;
  // SPARQL often returns Special:FilePath URLs
  if (fileUrlOrName.includes('Special:FilePath/')) {
    const name = decodeURIComponent(fileUrlOrName.split('Special:FilePath/')[1]);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
  }
  if (fileUrlOrName.startsWith('http')) {
    return fileUrlOrName.includes('?')
      ? `${fileUrlOrName}&width=${width}`
      : `${fileUrlOrName}?width=${width}`;
  }
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileUrlOrName)}?width=${width}`;
}

/**
 * Fetch core person data for a Wikidata Q-id.
 * @param {string} qid e.g. "Q7207"
 * @returns {Promise<object|null>}
 */
export async function fetchPerson(qid) {
  const sparql = `
SELECT ?person ?personLabel ?birth ?death ?image ?sitelinks ?enwiki ?desc WHERE {
  BIND(wd:${qid} AS ?person)
  OPTIONAL { ?person wdt:P569 ?birth. }
  OPTIONAL { ?person wdt:P570 ?death. }
  OPTIONAL { ?person wdt:P18 ?image. }
  OPTIONAL { ?person wikibase:sitelinks ?sitelinks. }
  OPTIONAL {
    ?enwikiArticle schema:about ?person ;
                   schema:isPartOf <https://en.wikipedia.org/> ;
                   schema:name ?enwiki.
  }
  OPTIONAL {
    ?person schema:description ?desc.
    FILTER(LANG(?desc) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1
`.trim();

  const rows = await runSparql(sparql);
  if (!rows.length) return null;

  const row = rows[0];
  const birthRaw = bindingValue(row, 'birth');
  const deathRaw = bindingValue(row, 'death');
  const imageRaw = bindingValue(row, 'image');

  return {
    id: qid,
    label: bindingValue(row, 'personLabel') || qid,
    description: bindingValue(row, 'desc') || '',
    birthYear: parseYear(birthRaw),
    deathYear: parseYear(deathRaw),
    birthRaw,
    deathRaw,
    image: commonsImageUrl(imageRaw, 480),
    imageThumb: commonsImageUrl(imageRaw, 200),
    sitelinks: Number(bindingValue(row, 'sitelinks') || 0),
    wikipediaTitle: bindingValue(row, 'enwiki') || null,
  };
}

/**
 * Fetch notable contemporaries whose lifespans overlap the target person.
 *
 * Query strategy (Wikidata is slow on unbounded human scans):
 * - Subquery with ORDER BY + LIMIT before labels
 * - Direct xsd:dateTime filters (avoid YEAR())
 * - Birth window: ~120 years before target birth through target death
 * - Death on or after target birth (or still living)
 * - Sitelinks threshold for notability
 *
 * @param {string} qid
 * @param {{
 *   birthYear: number|null,
 *   deathYear: number|null,
 *   birthRaw?: string|null,
 *   deathRaw?: string|null,
 * }} lifespan
 * @returns {Promise<object[]>}
 */
export async function fetchContemporaries(qid, lifespan) {
  const { birthYear, deathYear, birthRaw = null, deathRaw = null } = lifespan;

  if (birthYear == null) {
    throw new Error(
      'This person has no birth date on Wikidata, so contemporaries cannot be computed.',
    );
  }

  const targetEndYear = deathYear ?? new Date().getFullYear();
  const birthMinYear = birthYear - 120;

  const birthMinLit = sparqlDateLiteral(null, birthMinYear, 'start');
  const birthMaxLit =
    sparqlDateLiteral(deathRaw, deathYear, 'end') ||
    sparqlDateLiteral(null, targetEndYear, 'end');
  const targetBirthLit =
    sparqlDateLiteral(birthRaw, birthYear, 'start') ||
    sparqlDateLiteral(null, birthYear, 'start');

  // Inner query stays lean; labels/descriptions applied only to the top N.
  const sparql = `
SELECT ?person ?personLabel ?birth ?death ?image ?sitelinks ?enwiki ?desc WHERE {
  {
    SELECT ?person ?birth ?death ?sitelinks ?image ?enwiki WHERE {
      ?person wdt:P31 wd:Q5 ;
              wikibase:sitelinks ?sitelinks ;
              wdt:P569 ?birth .
      FILTER(?sitelinks >= ${SITELINKS_MIN})
      FILTER(?person != wd:${qid})
      FILTER(?birth >= ${birthMinLit})
      FILTER(?birth <= ${birthMaxLit})
      OPTIONAL { ?person wdt:P570 ?death. }
      # Still alive, or died on/after the target was born
      FILTER(!BOUND(?death) || ?death >= ${targetBirthLit})
      OPTIONAL { ?person wdt:P18 ?image. }
      OPTIONAL {
        ?article schema:about ?person ;
                 schema:isPartOf <https://en.wikipedia.org/> ;
                 schema:name ?enwiki.
      }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT ${CONTEMPORARIES_LIMIT}
  }
  OPTIONAL {
    ?person schema:description ?desc.
    FILTER(LANG(?desc) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim();

  const rows = await runSparql(sparql);

  const people = rows.map((row) => {
    const idUrl = bindingValue(row, 'person');
    const id = idUrl ? idUrl.split('/').pop() : null;
    const imageRaw = bindingValue(row, 'image');
    return {
      id,
      label: bindingValue(row, 'personLabel') || id,
      description: bindingValue(row, 'desc') || '',
      birthYear: parseYear(bindingValue(row, 'birth')),
      deathYear: parseYear(bindingValue(row, 'death')),
      image: commonsImageUrl(imageRaw, 320),
      imageThumb: commonsImageUrl(imageRaw, 160),
      sitelinks: Number(bindingValue(row, 'sitelinks') || 0),
      wikipediaTitle: bindingValue(row, 'enwiki') || null,
    };
  });

  // Deduplicate by id (multi-valued props can still multiply rows)
  const seen = new Set();
  return people.filter((p) => {
    if (!p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * Format years lived for display.
 * @param {number|null} birth
 * @param {number|null} death
 */
export function formatYears(birth, death) {
  const fmt = (y) => {
    if (y == null) return '?';
    if (y < 0) return `${Math.abs(y)} BCE`;
    return String(y);
  };
  if (birth == null && death == null) return 'Years unknown';
  if (death == null) return `${fmt(birth)} – present`;
  return `${fmt(birth)} – ${fmt(death)}`;
}
