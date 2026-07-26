import {
  searchEntities,
  fetchPerson,
  fetchContemporaries,
  formatYears,
} from './api/wikidata.js';
import { enrichWithWikipedia, enrichMany } from './api/wikipedia.js';
import {
  renderSearchResults,
  hideSearchResults,
  renderHero,
  renderGrid,
  setStatus,
} from './ui/render.js';

// ── DOM refs ──────────────────────────────────────────────────────────────
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchSection = document.getElementById('search-section');
const statusSection = document.getElementById('status-section');
const statusMessage = document.getElementById('status-message');
const heroSection = document.getElementById('hero-section');
const gridSection = document.getElementById('grid-section');
const gridTitle = document.getElementById('grid-title');
const gridMeta = document.getElementById('grid-meta');
const cardGrid = document.getElementById('card-grid');

// ── State ─────────────────────────────────────────────────────────────────
let searchDebounce = null;
let activeSearchController = null;
let loadToken = 0; // invalidate stale loads when user clicks quickly

// ── Search ────────────────────────────────────────────────────────────────
async function runSearch(query) {
  const q = query.trim();
  if (q.length < 2) {
    hideSearchResults(searchResults);
    searchInput.setAttribute('aria-expanded', 'false');
    return;
  }

  if (activeSearchController) {
    activeSearchController.abort();
  }
  activeSearchController = new AbortController();

  try {
    const results = await searchEntities(q, 8);
    if (activeSearchController.signal.aborted) return;

    renderSearchResults(searchResults, results, (item) => {
      hideSearchResults(searchResults);
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.value = item.label;
      loadPerson(item.id);
    });
    searchInput.setAttribute('aria-expanded', 'true');
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    searchResults.hidden = false;
    searchResults.innerHTML = `<div class="search-empty">Search failed. Check your connection and try again.</div>`;
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  runSearch(q);
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => runSearch(searchInput.value), 320);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideSearchResults(searchResults);
    searchInput.setAttribute('aria-expanded', 'false');
  }
});

// Click outside closes disambiguation
document.addEventListener('click', (e) => {
  if (!searchForm.contains(e.target)) {
    hideSearchResults(searchResults);
    searchInput.setAttribute('aria-expanded', 'false');
  }
});

// Example chips
document.querySelectorAll('[data-example]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = btn.getAttribute('data-example');
    searchInput.value = name;
    runSearch(name).then(() => {
      // Auto-pick first result for examples when available
      const first = searchResults.querySelector('.search-option');
      if (first) first.click();
    });
  });
});

// ── Person load ───────────────────────────────────────────────────────────
/**
 * Load a person by Wikidata Q-id into the hero slot and fetch contemporaries.
 * @param {string} qid
 */
async function loadPerson(qid) {
  const token = ++loadToken;

  heroSection.hidden = true;
  gridSection.hidden = true;
  searchSection.classList.add('is-compact');
  setStatus(statusSection, statusMessage, 'loading', 'Looking up this person…');

  try {
    const raw = await fetchPerson(qid);
    if (token !== loadToken) return;

    if (!raw) {
      setStatus(
        statusSection,
        statusMessage,
        'error',
        'Could not find that person on Wikidata.',
      );
      return;
    }

    setStatus(statusSection, statusMessage, 'loading', 'Fetching biography…');
    const person = await enrichWithWikipedia(raw);
    if (token !== loadToken) return;

    renderHero(heroSection, person);
    setStatus(
      statusSection,
      statusMessage,
      'loading',
      `Finding people alive during ${person.label}'s lifetime… (Wikidata can take ~10–20s)`,
    );

    let contemporaries = [];
    try {
      contemporaries = await fetchContemporaries(qid, {
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        birthRaw: person.birthRaw,
        deathRaw: person.deathRaw,
      });
    } catch (err) {
      if (token !== loadToken) return;
      console.error(err);
      setStatus(statusSection, statusMessage, null);
      renderHero(heroSection, person);
      gridSection.hidden = false;
      gridTitle.textContent = 'Contemporaries';
      gridMeta.textContent = 'Could not load contemporaries (query timed out or failed).';
      cardGrid.innerHTML = `
        <div class="empty-grid">
          <p>${escapeText(err.message || 'Query failed')}</p>
          <p class="muted">Wikidata can be slow for busy periods of history. Try again in a moment.</p>
        </div>
      `;
      updateUrl(qid, person.label);
      return;
    }

    if (token !== loadToken) return;

    setStatus(
      statusSection,
      statusMessage,
      'loading',
      `Enriching ${contemporaries.length} contemporaries…`,
    );

    const enriched = await enrichMany(contemporaries, 6);
    if (token !== loadToken) return;

    setStatus(statusSection, statusMessage, null);

    const years = formatYears(person.birthYear, person.deathYear);
    gridTitle.textContent = `Alive during ${person.label}'s lifetime`;
    gridMeta.textContent = `${enriched.length} notable figures · ${years} · ranked by Wikipedia notability`;
    gridSection.hidden = false;

    renderGrid(cardGrid, enriched, (next) => {
      searchInput.value = next.label;
      loadPerson(next.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    updateUrl(qid, person.label);
  } catch (err) {
    if (token !== loadToken) return;
    console.error(err);
    setStatus(
      statusSection,
      statusMessage,
      'error',
      err.message || 'Something went wrong. Please try again.',
    );
  }
}

function escapeText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function updateUrl(qid, label) {
  const url = new URL(window.location.href);
  url.searchParams.set('id', qid);
  if (label) url.searchParams.set('name', label);
  history.replaceState({ qid }, '', url);
}

// Brand click resets view
document.getElementById('brand-link')?.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  loadToken++;
  heroSection.hidden = true;
  gridSection.hidden = true;
  setStatus(statusSection, statusMessage, null);
  searchSection.classList.remove('is-compact');
  searchInput.value = '';
  hideSearchResults(searchResults);
  const url = new URL(window.location.href);
  url.search = '';
  history.replaceState({}, '', url);
  searchInput.focus();
});

// Deep-link: ?id=Q7207
const params = new URLSearchParams(window.location.search);
const initialId = params.get('id');
if (initialId && /^Q\d+$/i.test(initialId)) {
  if (params.get('name')) searchInput.value = params.get('name');
  loadPerson(initialId.toUpperCase());
} else {
  searchInput.focus();
}
