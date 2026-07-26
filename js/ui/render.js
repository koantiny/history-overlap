/**
 * DOM rendering helpers for search results, hero card, and contemporary grid.
 */

import { formatYears } from '../api/wikidata.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function portraitHtml(src, alt, sizeClass = '') {
  if (src) {
    return `<img class="portrait ${sizeClass}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
  }
  const initial = (alt || '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="portrait portrait-fallback ${sizeClass}" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

/**
 * Render search disambiguation list.
 * @param {HTMLElement} container
 * @param {Array<{ id: string, label: string, description: string }>} results
 * @param {(item: object) => void} onSelect
 */
export function renderSearchResults(container, results, onSelect) {
  container.innerHTML = '';

  if (!results.length) {
    container.hidden = false;
    container.innerHTML = `<div class="search-empty">No matches found. Try a fuller name or alternate spelling.</div>`;
    return;
  }

  const list = document.createElement('ul');
  list.className = 'search-list';

  results.forEach((item, index) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `search-option-${index}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-option';
    btn.innerHTML = `
      <span class="search-option-label">${escapeHtml(item.label)}</span>
      ${item.description ? `<span class="search-option-desc">${escapeHtml(item.description)}</span>` : ''}
      <span class="search-option-id">${escapeHtml(item.id)}</span>
    `;
    btn.addEventListener('click', () => onSelect(item));
    li.appendChild(btn);
    list.appendChild(li);
  });

  container.appendChild(list);
  container.hidden = false;
}

export function hideSearchResults(container) {
  container.hidden = true;
  container.innerHTML = '';
}

/**
 * Render the large hero card for the selected person.
 * @param {HTMLElement} container
 * @param {object} person
 */
export function renderHero(container, person) {
  const years = formatYears(person.birthYear, person.deathYear);
  const pageUrl = person.pageUrl || (person.id ? `https://www.wikidata.org/wiki/${person.id}` : '#');
  const extract = person.extract
    ? person.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')
    : person.description || 'No summary available.';

  container.innerHTML = `
    <article class="hero-card">
      <div class="hero-portrait-wrap">
        ${portraitHtml(person.image || person.imageThumb, person.label, 'portrait-hero')}
      </div>
      <div class="hero-body">
        <p class="hero-eyebrow">Selected figure</p>
        <h2 class="hero-name">${escapeHtml(person.label)}</h2>
        ${person.description ? `<p class="hero-role">${escapeHtml(person.description)}</p>` : ''}
        <p class="hero-years">${escapeHtml(years)}</p>
        <p class="hero-extract">${escapeHtml(extract)}</p>
        <div class="hero-actions">
          <a class="btn btn-secondary" href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener noreferrer">
            ${person.wikipediaTitle ? 'View on Wikipedia' : 'View on Wikidata'}
            <span aria-hidden="true">↗</span>
          </a>
          ${person.id ? `<span class="hero-qid">${escapeHtml(person.id)}</span>` : ''}
        </div>
      </div>
    </article>
  `;
  container.hidden = false;
}

/**
 * Render the grid of contemporary people cards.
 * @param {HTMLElement} container
 * @param {object[]} people
 * @param {(person: object) => void} onSelect
 */
export function renderGrid(container, people, onSelect) {
  container.innerHTML = '';

  if (!people.length) {
    container.innerHTML = `
      <div class="empty-grid">
        <p>No notable contemporaries found with the current filters.</p>
        <p class="muted">Try someone with a well-documented lifespan on Wikidata.</p>
      </div>
    `;
    return;
  }

  people.forEach((person) => {
    const years = formatYears(person.birthYear, person.deathYear);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'person-card';
    card.setAttribute('aria-label', `Select ${person.label}`);
    card.innerHTML = `
      ${portraitHtml(person.imageThumb || person.image, person.label, 'portrait-card')}
      <div class="person-card-body">
        <h3 class="person-card-name">${escapeHtml(person.label)}</h3>
        <p class="person-card-years">${escapeHtml(years)}</p>
        ${person.description ? `<p class="person-card-desc">${escapeHtml(person.description)}</p>` : ''}
      </div>
    `;
    card.addEventListener('click', () => onSelect(person));
    container.appendChild(card);
  });
}

/**
 * Show / update status section (loading, error, empty).
 * @param {HTMLElement} section
 * @param {HTMLElement} messageEl
 * @param {'loading'|'error'|'empty'|null} mode
 * @param {string} [message]
 */
export function setStatus(section, messageEl, mode, message = '') {
  if (!mode) {
    section.hidden = true;
    section.dataset.mode = '';
    return;
  }

  section.hidden = false;
  section.dataset.mode = mode;
  messageEl.textContent = message;

  const spinner = section.querySelector('.spinner');
  if (spinner) {
    spinner.hidden = mode !== 'loading';
  }
}
