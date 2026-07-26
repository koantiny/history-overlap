/**
 * Wikipedia REST API helpers for page summaries and thumbnails.
 */

const SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary';

/**
 * Fetch a page summary by English Wikipedia title.
 * @param {string} title
 * @returns {Promise<{
 *   title: string,
 *   description: string|null,
 *   extract: string,
 *   thumbnail: string|null,
 *   originalImage: string|null,
 *   pageUrl: string,
 * }|null>}
 */
export async function fetchSummary(title) {
  if (!title) return null;

  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const res = await fetch(`${SUMMARY_BASE}/${encoded}`, {
    headers: {
      Accept: 'application/json',
      'Api-User-Agent': 'ContemporariesApp/0.1 (static educational demo)',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Wikipedia summary failed (${res.status})`);
  }

  const data = await res.json();

  // Disambiguation / special pages are not useful as hero content
  if (data.type === 'disambiguation') return null;

  return {
    title: data.title || title,
    description: data.description || null,
    extract: data.extract || '',
    thumbnail: data.thumbnail?.source || null,
    originalImage: data.originalimage?.source || null,
    pageUrl:
      data.content_urls?.desktop?.page ||
      `https://en.wikipedia.org/wiki/${encoded}`,
  };
}

/**
 * Enrich a Wikidata person object with Wikipedia summary text and better images.
 * Mutates nothing; returns a new object.
 * @param {object} person
 */
export async function enrichWithWikipedia(person) {
  if (!person?.wikipediaTitle) {
    return {
      ...person,
      extract: '',
      pageUrl: person.id
        ? `https://www.wikidata.org/wiki/${person.id}`
        : null,
    };
  }

  try {
    const summary = await fetchSummary(person.wikipediaTitle);
    if (!summary) {
      return {
        ...person,
        extract: '',
        pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(person.wikipediaTitle)}`,
      };
    }

    return {
      ...person,
      label: person.label || summary.title,
      description: person.description || summary.description || '',
      extract: summary.extract || '',
      // Prefer Wikipedia images when available (usually better framed portraits)
      image: summary.originalImage || summary.thumbnail || person.image,
      imageThumb: summary.thumbnail || person.imageThumb || person.image,
      pageUrl: summary.pageUrl,
    };
  } catch {
    return {
      ...person,
      extract: '',
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(person.wikipediaTitle)}`,
    };
  }
}

/**
 * Enrich many people with Wikipedia summaries in parallel (bounded).
 * @param {object[]} people
 * @param {number} [concurrency=6]
 */
export async function enrichMany(people, concurrency = 6) {
  const results = new Array(people.length);
  let index = 0;

  async function worker() {
    while (index < people.length) {
      const i = index++;
      results[i] = await enrichWithWikipedia(people[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, people.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
