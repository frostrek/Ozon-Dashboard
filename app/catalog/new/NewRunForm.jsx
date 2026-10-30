'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TypeSelect from '../../components/TypeSelect';

const WEIGHT_BANDS = [
  { id: 'upto100', label: 'Up to 100 g', help: 'Also creates packs of 2, 3 and 4.' },
  { id: 'upto200', label: '101 to 200 g', help: 'Also creates a pack of 2.' },
  { id: 'upto500', label: '201 to 500 g', help: 'Sold as one unit.' },
  { id: 'over500', label: 'Over 500 g', help: 'Sold as one unit.' },
  { id: 'unknown', label: 'Weight not listed on Amazon', help: 'Sold as one unit.' },
];

const EMPTY_BANDS = {
  upto100: false,
  upto200: false,
  upto500: false,
  over500: false,
  unknown: false,
};

const RATING_CHOICES = [
  { id: '3', label: '3 stars and above' },
  { id: '4', label: '4 stars and above' },
  { id: '4.5', label: '4.5 stars and above' },
];

const CUSTOM_CONDITIONS = [
  { id: 'weight-max', label: 'Weight at most', unit: 'grams' },
  { id: 'weight-min', label: 'Weight at least', unit: 'grams' },
  { id: 'rating-min', label: 'Rating at least', unit: 'stars' },
  { id: 'price-max', label: 'Price at most', unit: 'INR' },
  { id: 'price-min', label: 'Price at least', unit: 'INR' },
];

const EXTRA_RULES = [
  { id: 'inStockOnly', label: 'Only products that are in stock', help: 'Out-of-stock Amazon listings are left out.' },
  { id: 'skipSponsored', label: 'Skip sponsored listings', help: 'Paid search ads are left out. Normal results stay.' },
  { id: 'skipUnrated', label: 'Skip products with no star rating', help: 'A listing with no stars is left out.' },
  { id: 'makePacks', label: 'Create quantity packs for light products', help: 'Packs of 2, 3 and 4 still follow the weight bands above.' },
  { id: 'includeShades', label: 'Include color and shade variants', help: 'Each shade becomes its own product. Leave this off to keep one listing.' },
];

const EMPTY_RULES = {
  minRating: 0,
  inStockOnly: false,
  skipSponsored: false,
  skipUnrated: false,
  makePacks: false,
  includeShades: false,
  custom: { kind: '', amount: '' },
};

function isOldDefaultSelection(bands = {}, rules = {}) {
  return Boolean(bands.upto100 && bands.upto200 && bands.upto500 && !bands.over500 && !bands.unknown
    && Number(rules.minRating) === 4 && rules.inStockOnly && rules.makePacks && rules.includeShades
    && !rules.skipSponsored && !rules.skipUnrated && !rules.custom?.kind);
}

const PRESETS = [
  { id: 'sunscreen', label: 'Sunscreen', catId: 17028991, typeId: 629618165 },
  { id: 'face-wash', label: 'Face Wash', catId: 17028991, typeId: 93897 },
  { id: 'hair-serum', label: 'Hair Serum', catId: 17028992, typeId: 93945 },
  { id: 'smartphone', label: 'Smartphone', catId: 17036000, typeId: 10000000000 },
];

const STEPS = [
  { id: 'keyword', label: 'Scrape', title: 'Category to scrape' },
  { id: 'brand', label: 'Brand', title: 'Brand filter' },
  { id: 'category', label: 'Ozon', title: 'Ozon category' },
  { id: 'count', label: 'Count', title: 'How many products' },
  { id: 'conditions', label: 'Conditions', title: 'Scrape conditions' },
  { id: 'progress', label: 'Start', title: 'Start page' },
  { id: 'price', label: 'Price', title: 'Old price' },
  { id: 'pages', label: 'Pages', title: 'Pages in this batch' },
];

export default function NewRunForm({ accounts, activeRun = null }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [stepId, setStepId] = useState('keyword');
  const [keyword, setKeyword] = useState('');
  const [brand, setBrand] = useState('');
  const [choice, setChoice] = useState('face-wash');
  const [category, setCategory] = useState(PRESETS[1]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [searchNote, setSearchNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [manualCatId, setManualCatId] = useState('');
  const [manualTypeId, setManualTypeId] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [progressNote, setProgressNote] = useState('Checking the catalog database for the last scraped page.');
  const [progressFound, setProgressFound] = useState(false);
  const [lastPage, setLastPage] = useState(0);
  const [startPage, setStartPage] = useState('');
  const [skipScrape, setSkipScrape] = useState(false);
  const [oldPriceMultiplier, setOldPriceMultiplier] = useState('');
  const [pages, setPages] = useState('');
  const [productCount, setProductCount] = useState('');
  const [skipProductLimit, setSkipProductLimit] = useState(false);
  const [weightBands, setWeightBands] = useState(EMPTY_BANDS);
  const [scrapeRules, setScrapeRules] = useState(EMPTY_RULES);
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const searchSerial = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/catalog/settings', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !data) return;
        setStartPage(String(data.startPage ?? ''));
        setPages(String(data.pages ?? ''));
        setOldPriceMultiplier(String(data.oldPriceMultiplier ?? ''));
        const savedCount = Number(data.productLimit);
        setSkipProductLimit(savedCount === 0);
        setProductCount(savedCount > 0 ? String(savedCount) : '');
        const savedBands = { ...EMPTY_BANDS, ...(data.weightBands || {}) };
        const savedRules = { ...EMPTY_RULES, ...(data.scrapeRules || {}), custom: { ...EMPTY_RULES.custom, ...(data.scrapeRules?.custom || {}) } };
        if (!isOldDefaultSelection(savedBands, savedRules)) {
          setWeightBands(savedBands);
          setScrapeRules({
            ...savedRules,
            custom: {
              kind: savedRules.custom?.kind || '',
              amount: Number(savedRules.custom?.amount) > 0 ? String(savedRules.custom.amount) : '',
            },
          });
        }
        setSettingsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOldPriceMultiplier('2');
          setPages('3');
          setStartPage('1');
          setSettingsReady(true);
          setError('Saved catalog settings could not be loaded. Using defaults.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const visibleSteps = skipScrape ? STEPS.filter((step) => step.id !== 'pages') : STEPS;
  const stepIndex = Math.max(0, visibleSteps.findIndex((step) => step.id === stepId));

  useEffect(() => {
    if (stepId !== 'progress' || !category?.catId || !category?.typeId) return undefined;
    const params = new URLSearchParams({
      keyword: keyword.trim(),
      brand: brand.trim(),
      catId: String(category.catId),
      typeId: String(category.typeId),
    });
    let cancelled = false;
    fetch(`/api/catalog/progress?${params}`, { cache: 'no-store' })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        setProgressFound(Boolean(data.found));
        setLastPage(Number(data.lastPage) || 0);
        setProgressNote(data.message || 'Enter the page to start from. Type 0 to skip scraping.');
        if (data.found) {
          setSkipScrape(false);
          setStartPage(String(Number(data.suggestedPage) || Number(data.lastPage) + 1));
        }
      })
      .catch(() => {
        if (!cancelled) setProgressFound(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stepId, keyword, brand, category]);

  useEffect(() => {
    if (choice !== 'search') return undefined;
    const text = query.trim();
    if (text.length < 2) return undefined;
    const serial = searchSerial.current + 1;
    searchSerial.current = serial;
    const timer = window.setTimeout(() => searchCategories(serial, text), 300);
    return () => window.clearTimeout(timer);
  }, [query, choice]);

  async function searchCategories(serial, text) {
    setSearching(true);
    setSearchNote('');
    try {
      const response = await fetch(`/api/catalog/categories?q=${encodeURIComponent(text)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (serial !== searchSerial.current) return;
      setResults(Array.isArray(data.results) ? data.results : []);
      if (!response.ok || data.error) setSearchNote(data.error || 'Category search failed.');
      else if (!data.results?.length) setSearchNote('No matching categories.');
    } catch {
      if (serial === searchSerial.current) setSearchNote('Category search failed.');
    } finally {
      if (serial === searchSerial.current) setSearching(false);
    }
  }

  function chosenCategory() {
    if (choice === 'custom') {
      const catId = Number(manualCatId);
      const typeId = Number(manualTypeId);
      if (!catId || !typeId) return null;
      return { catId, typeId, label: manualLabel.trim() || `${catId} / ${typeId}` };
    }
    if (choice === 'search') return picked?.catId && picked?.typeId ? picked : null;
    return PRESETS.find((item) => item.id === choice) || null;
  }

  function goNext(event) {
    event?.preventDefault();
    setError('');
    if (stepId === 'keyword') {
      if (!keyword.trim()) {
        setError('Enter a category to scrape.');
        return;
      }
      setKeyword(keyword.trim());
      setStepId('brand');
      return;
    }
    if (stepId === 'brand') {
      setBrand(brand.trim());
      setStepId('category');
      return;
    }
    if (stepId === 'category') {
      const selected = chosenCategory();
      if (!selected) {
        setError(choice === 'custom'
          ? 'Enter a category id and a type id.'
          : 'Choose an Ozon category, or search and pick a result.');
        return;
      }
      setCategory(selected);
      setStepId('count');
      return;
    }
    if (stepId === 'count') {
      if (!skipProductLimit && !(Number(productCount) >= 1)) {
        setError('Enter how many products to collect, or choose Skip.');
        return;
      }
      setStepId('conditions');
      return;
    }
    if (stepId === 'conditions') {
      if (scrapeRules.custom?.kind && !(Number(scrapeRules.custom.amount) > 0)) {
        setError('Enter how much for the custom condition, or set it back to nothing selected.');
        return;
      }
      setStepId('progress');
      return;
    }
    if (stepId === 'progress') {
      const page = Number(startPage);
      if (skipScrape || page === 0) {
        setSkipScrape(true);
        setStepId('price');
        return;
      }
      if (!(page >= 1)) {
        setError('Enter a start page, or 0 to skip scraping.');
        return;
      }
      setSkipScrape(false);
      setStepId('price');
      return;
    }
    if (stepId === 'price') {
      if (!(Number(oldPriceMultiplier) >= 1)) {
        setError('Old price multiplier must be at least 1.');
        return;
      }
      if (skipScrape) {
        startRun(event);
        return;
      }
      setStepId('pages');
      return;
    }
    startRun(event);
  }

  async function startRun(event) {
    event?.preventDefault();
    setError('');
    const selected = chosenCategory();
    if (activeRun) {
      setError('A catalog run is already in progress. Open it and wait for it to finish.');
      return;
    }
    if (!selected) {
      setError('Choose an Ozon category before starting.');
      setStepId('category');
      return;
    }
    const pageCount = skipScrape ? 0 : Number(pages);
    if (!skipScrape && !(pageCount >= 0 && pageCount <= 10)) {
      setError('Page count must be from 0 to 10. 0 skips scraping and uses products already saved.');
      return;
    }
    setStarting(true);
    try {
      const response = await fetch('/api/catalog-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          mode: 'bulk',
          action: 'preview',
          keyword,
          brand,
          pages: pageCount === 0 ? 0 : pageCount,
          startPage: Math.max(1, Number(startPage) || 1),
          oldPriceMultiplier,
          maxProducts: skipProductLimit ? 0 : Number(productCount),
          weightBands,
          scrapeRules,
          category: selected,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.runId) {
        setError(data.error || 'The catalog run could not be started.');
        if (data.runId) router.push(`/catalog/runs/${data.runId}`);
        return;
      }
      router.push(`/catalog/runs/${data.runId}`);
      fetch('/api/catalog/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startPage: Number(startPage) || 0,
          pages: pageCount,
          oldPriceMultiplier: Number(oldPriceMultiplier),
          productLimit: skipProductLimit ? 0 : Number(productCount),
          weightBands,
          scrapeRules,
        }),
      }).catch(() => {});
    } catch {
      setError('The catalog run could not be started.');
    } finally {
      setStarting(false);
    }
  }

  const blocked = Boolean(activeRun) || starting;
  const sameAccount = activeRun && activeRun.accountId === accountId;

  return (
    <form className="stack catalog-form catalog-wizard" onSubmit={goNext}>
      {activeRun ? (
        <p className="catalog-live" role="status">
          <span className="catalog-spinner" aria-hidden="true" />
          Run in progress for {activeRun.accountName}.{' '}
          <Link href={`/catalog/runs/${activeRun.runId}`}>{activeRun.title}</Link>
          {' '}
          {sameAccount
            ? 'Start stays off for this account until that run finishes.'
            : 'Only one catalog run can be active, so Start stays off until it finishes.'}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Account</span>
        <span className="field-help">The API key stays on the server.</span>
        <TypeSelect
          label="Account"
          value={accountId}
          options={accounts.map((account) => ({ id: account.id, label: account.name }))}
          onChange={setAccountId}
        />
      </label>

      <ol className="catalog-steps" aria-label="Catalog questions">
        {visibleSteps.map((item, index) => (
          <li key={item.id} data-state={item.id === stepId ? 'current' : index < stepIndex ? 'done' : 'upcoming'}>
            <span className="catalog-step-bar" />
            <span className="catalog-step-index">{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>

      <p className="catalog-step-kicker">Question {stepIndex + 1} of {visibleSteps.length} · {visibleSteps[stepIndex]?.title}</p>

      {stepId === 'keyword' ? (
        <label className="field">
          <span className="field-label">Category to scrape</span>
          <span className="field-help">For example Serum or Face Wash. This is the Amazon search.</span>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="sunscreen" autoFocus />
        </label>
      ) : null}

      {stepId === 'brand' ? (
        <label className="field">
          <span className="field-label">Optional brand filter</span>
          <span className="field-help">Press Continue with this empty to use all brands. For example L&apos;Oreal or Minimalist.</span>
          <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="e.g. L'Oreal, Minimalist" autoFocus />
        </label>
      ) : null}

      {stepId === 'category' ? (
        <fieldset className="catalog-choice">
          <legend className="field-label">Ozon category to push to</legend>
          <div className="catalog-option-list">
            {PRESETS.map((item) => (
              <label key={item.id}>
                <input type="radio" name="ozon-category" checked={choice === item.id} onChange={() => { setChoice(item.id); setCategory(item); }} />
                {item.label}
              </label>
            ))}
            <label>
              <input type="radio" name="ozon-category" checked={choice === 'search'} onChange={() => setChoice('search')} />
              <span>Search Ozon categories{picked ? `: ${picked.label}` : ''}</span>
            </label>
            <label>
              <input type="radio" name="ozon-category" checked={choice === 'custom'} onChange={() => setChoice('custom')} />
              Enter custom ids
            </label>
          </div>
          {choice === 'search' ? (
            <div className="catalog-follow">
              <label className="field">
                <span className="field-label">Search</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Face Cream" aria-label="Search Ozon categories" autoFocus />
              </label>
              <label className="field">
                <span className="field-label">Select a category</span>
                <TypeSelect
                  label="Category"
                  value={picked ? `${picked.catId}:${picked.typeId}` : ''}
                  options={[
                    { id: '', label: searching ? 'Searching…' : (results.length ? 'Choose from the list' : 'Type at least 2 letters') },
                    ...results.map((item) => ({ id: `${item.catId}:${item.typeId}`, label: item.label })),
                    ...(picked && !results.some((item) => item.catId === picked.catId && item.typeId === picked.typeId)
                      ? [{ id: `${picked.catId}:${picked.typeId}`, label: picked.label }]
                      : []),
                  ]}
                  onChange={(next) => {
                    const item = results.find((row) => `${row.catId}:${row.typeId}` === next)
                      || (picked && `${picked.catId}:${picked.typeId}` === next ? picked : null);
                    if (!item) return;
                    setPicked(item);
                    setCategory(item);
                  }}
                />
              </label>
              {searching ? <p className="field-help">Searching the saved Ozon category list…</p> : null}
              {searchNote ? <p className="field-help">{searchNote}</p> : null}
              {picked ? (
                <p className="catalog-selected">Selected: {picked.label}</p>
              ) : null}
            </div>
          ) : null}
          {choice === 'custom' ? (
            <div className="catalog-follow">
              <label className="field">
                <span className="field-label">Category id</span>
                <input value={manualCatId} onChange={(event) => setManualCatId(event.target.value)} inputMode="numeric" placeholder="17028991" />
              </label>
              <label className="field">
                <span className="field-label">Type id</span>
                <input value={manualTypeId} onChange={(event) => setManualTypeId(event.target.value)} inputMode="numeric" placeholder="93897" />
              </label>
              <label className="field">
                <span className="field-label">Label</span>
                <input value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} placeholder="Face Cream" />
              </label>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {stepId === 'count' ? (
        <div className="catalog-choice">
          <h2 className="catalog-question">How many products should this scrape collect?</h2>
          <p className="field-help">Click the box, then type how many products to keep. The scrape stops after that many matches.</p>
          <label className="field" htmlFor="product-count">
            <span className="field-label">Number of products</span>
            <input
              id="product-count"
              className="catalog-count-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={skipProductLimit ? '' : productCount}
              placeholder="Type a number, for example 20"
              disabled={skipProductLimit}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                setSkipProductLimit(false);
                setProductCount(event.target.value.replace(/[^\d]/g, ''));
              }}
              autoFocus
            />
          </label>
          <label className="catalog-skip">
            <input type="checkbox" checked={skipProductLimit} onChange={(event) => setSkipProductLimit(event.target.checked)} />
            <span>
              <span className="field-label">Skip</span>
              <span className="field-help">Do not set a limit. Keep every matching product on the pages you choose.</span>
            </span>
          </label>
        </div>
      ) : null}

      {stepId === 'conditions' ? (
        <div className="catalog-condition-stack">
          <h2 className="catalog-question">Which conditions should this scrape use?</h2>
          <p className="field-help">Nothing is selected at the start, and none of these are required. Leave a box off to ignore that rule.</p>
          <fieldset className="catalog-condition" disabled={!settingsReady}>
            <legend>Weight</legend>
            <p className="field-help">Optional. Leave every box off to keep every weight.</p>
            <div className="catalog-checks">
              {WEIGHT_BANDS.map((band) => (
                <label key={band.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(weightBands[band.id])}
                    onChange={(event) => setWeightBands((current) => ({ ...current, [band.id]: event.target.checked }))}
                  />
                  <span>
                    <span className="field-label">{band.label}</span>
                    <span className="field-help">{band.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="catalog-condition" disabled={!settingsReady}>
            <legend>Rating</legend>
            <p className="field-help">Optional. Leave these off to keep every rating.</p>
            <div className="catalog-checks catalog-checks-grid">
              {RATING_CHOICES.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="min-rating"
                    checked={String(scrapeRules.minRating) === item.id}
                    onChange={() => setScrapeRules((current) => ({ ...current, minRating: Number(item.id) }))}
                  />
                  <span className="field-label">{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="catalog-condition" disabled={!settingsReady}>
            <legend>Other conditions</legend>
            <p className="field-help">Tick a condition to apply it. Leave it off to ignore that rule.</p>
            <div className="catalog-checks">
              {EXTRA_RULES.map((rule) => (
                <label key={rule.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(scrapeRules[rule.id])}
                    onChange={(event) => setScrapeRules((current) => ({ ...current, [rule.id]: event.target.checked }))}
                  />
                  <span>
                    <span className="field-label">{rule.label}</span>
                    <span className="field-help">{rule.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="catalog-condition" disabled={!settingsReady}>
            <legend>Custom condition</legend>
            <p className="field-help">Optional. Choose what to limit and enter how much. For example weight at most 750 grams, or price at least 200 INR.</p>
            <div className="catalog-custom">
              <label className="field">
                <span className="field-label">What</span>
                <TypeSelect
                  label="Condition"
                  value={scrapeRules.custom?.kind || ''}
                  options={[{ id: '', label: 'Nothing selected' }, ...CUSTOM_CONDITIONS.map((item) => ({ id: item.id, label: item.label }))]}
                  onChange={(next) => setScrapeRules((current) => ({
                    ...current,
                    custom: { kind: next, amount: next ? current.custom?.amount || '' : '' },
                  }))}
                />
              </label>
              <label className="field">
                <span className="field-label">How much{scrapeRules.custom?.kind ? ` (${CUSTOM_CONDITIONS.find((item) => item.id === scrapeRules.custom.kind)?.unit})` : ''}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="750"
                  value={scrapeRules.custom?.amount || ''}
                  disabled={!scrapeRules.custom?.kind}
                  onChange={(event) => setScrapeRules((current) => ({
                    ...current,
                    custom: { kind: current.custom?.kind || '', amount: event.target.value },
                  }))}
                />
              </label>
            </div>
          </fieldset>
        </div>
      ) : null}

      {stepId === 'progress' ? (
        <div className="field">
          <span className="field-label">{progressNote}</span>
          {progressFound ? (
            <div className="catalog-brand-list">
              <button type="button" data-selected={!skipScrape && Number(startPage) === lastPage + 1 ? 'true' : 'false'} onClick={() => { setSkipScrape(false); setStartPage(String(lastPage + 1)); }}>
                Resume from page {lastPage + 1}
              </button>
              <button type="button" data-selected={!skipScrape && Number(startPage) === 1 ? 'true' : 'false'} onClick={() => { setSkipScrape(false); setStartPage('1'); }}>
                Start fresh from page 1
              </button>
              <button type="button" data-selected={skipScrape ? 'true' : 'false'} onClick={() => setSkipScrape(true)}>
                Skip scraping and push existing items
              </button>
            </div>
          ) : (
            <label className="field">
              <span className="field-help">Type the page number. Type 0 to skip scraping.</span>
              <input id="start-page" type="text" inputMode="numeric" value={startPage} onFocus={(event) => event.target.select()} onChange={(event) => { const next = event.target.value.replace(/[^\d]/g, ''); setStartPage(next); setSkipScrape(Number(next) === 0); }} autoFocus />
            </label>
          )}
        </div>
      ) : null}

      {stepId === 'price' ? (
        <label className="field">
          <span className="field-label">Old price multiplier</span>
          <span className="field-help">For example 2.0 for a 50% discount label.</span>
          <input type="number" min="1" step="0.1" value={oldPriceMultiplier} onChange={(event) => setOldPriceMultiplier(event.target.value)} autoFocus />
        </label>
      ) : null}

      {stepId === 'pages' ? (
        <label className="field">
          <span className="field-label">How many pages to scrape in this batch?</span>
          <span className="field-help">Type 0 to skip scraping and push products already saved.</span>
          <input type="number" min="0" max="10" value={pages} onChange={(event) => setPages(event.target.value)} autoFocus />
        </label>
      ) : null}

      {error ? <p className="login-error" role="alert">{error}</p> : null}

      <div className="dash-actions">
        {stepIndex > 0 ? (
          <button type="button" className="button-secondary" onClick={() => { setError(''); setStepId(visibleSteps[Math.max(0, visibleSteps.findIndex((step) => step.id === stepId) - 1)].id); }}>
            Back
          </button>
        ) : null}
        <button type="submit" className="dash-primary" disabled={blocked}>
          {starting ? 'Starting…' : (stepId === 'pages' || (stepId === 'price' && skipScrape) ? 'Scrape and preview' : 'Continue')}
        </button>
      </div>
    </form>
  );
}
