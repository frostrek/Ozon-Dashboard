'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export const FETCH_SIZE = 100;
export const UI_BATCH = 10;

export function useBatchScroll({
  initialItems = [],
  initialTotal = 0,
  resetKey = '',
  itemKey = 'id',
  loadPage,
  pageMode = false,
}) {
  const [fetched, setFetched] = useState(initialItems);
  const [visibleCount, setVisibleCount] = useState(Math.min(UI_BATCH, initialItems.length));
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [nextPage, setNextPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const requestId = useRef(0);
  const sentinelRef = useRef(null);
  const tableWrapRef = useRef(null);
  const scrollArmed = useRef(false);
  const skipReset = useRef(true);
  const latest = useRef({});
  const hasMore = fetched.length < total;
  latest.current = { fetched, visibleCount, total, nextPage, hasMore, loadPage, itemKey, currentPage };

  async function fetchBatch(page, replace) {
    if (!loadPage) return null;
    if (!replace && loadingRef.current) return null;
    const id = requestId.current + 1;
    requestId.current = id;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await loadPage(page);
      if (id !== requestId.current) return null;
      const incoming = Array.isArray(data?.items) ? data.items : [];
      const counted = Number(data?.total);
      setFetched((previous) => {
        if (replace) return incoming;
        const key = latest.current.itemKey;
        const seen = new Set(previous.map((item) => item[key]));
        return [...previous, ...incoming.filter((item) => !seen.has(item[key]))];
      });
      if (Number.isFinite(counted)) setTotal(counted);
      setNextPage(page + 1);
      if (replace) {
        setVisibleCount(Math.min(UI_BATCH, incoming.length));
        setCurrentPage(1);
      }
      return incoming;
    } catch (err) {
      if (id !== requestId.current) return null;
      setError(err.message || 'The next batch could not be loaded.');
      return null;
    } finally {
      if (id === requestId.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  async function ensureLoadedThrough(needCount) {
    const target = Math.min(needCount, latest.current.total || needCount);
    let guard = 0;
    while (latest.current.fetched.length < target && latest.current.fetched.length < latest.current.total && guard < 40) {
      if (loadingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        guard += 1;
        continue;
      }
      const batch = await fetchBatch(latest.current.nextPage, false);
      if (!batch?.length) break;
      guard += 1;
    }
  }

  async function goToPage(page) {
    const pages = Math.max(1, Math.ceil((latest.current.total || 0) / UI_BATCH));
    const safe = Math.min(Math.max(1, page), pages);
    setCurrentPage(safe);
    await ensureLoadedThrough(safe * UI_BATCH);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function revealNext() {
    const state = latest.current;
    if (loadingRef.current) return;
    if (state.visibleCount < state.fetched.length) {
      setVisibleCount((current) => Math.min(current + UI_BATCH, state.fetched.length));
      return;
    }
    if (!state.loadPage || state.fetched.length >= state.total) return;
    fetchBatch(state.nextPage, false).then((incoming) => {
      if (incoming?.length) setVisibleCount((current) => current + UI_BATCH);
    });
  }

  function retry() {
    const state = latest.current;
    fetchBatch(state.fetched.length ? state.nextPage : 1, state.fetched.length === 0);
  }

  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      setFetched(initialItems);
      setTotal(initialTotal);
      if (loadPage && initialItems.length === 0) {
        fetchBatch(1, true);
      }
      return;
    }
    setCurrentPage(1);
    setNextPage(2);
    setError('');
    if (loadPage) {
      setFetched([]);
      setVisibleCount(0);
      fetchBatch(1, true);
    } else {
      setFetched(initialItems);
      setVisibleCount(Math.min(UI_BATCH, initialItems.length));
      setTotal(initialTotal);
    }
  }, [resetKey]);

  useEffect(() => {
    if (loadPage) return;
    setFetched(initialItems);
    setTotal(initialItems.length);
    setVisibleCount((current) => {
      if (initialItems.length === 0) return 0;
      if (current < UI_BATCH) return Math.min(UI_BATCH, initialItems.length);
      return Math.min(current, initialItems.length);
    });
  }, [loadPage, initialItems.length]);

  useEffect(() => {
    if (pageMode || !loadPage) return undefined;
    function arm() {
      scrollArmed.current = true;
    }
    window.addEventListener('scroll', arm, { passive: true });
    const wrap = tableWrapRef.current;
    wrap?.addEventListener('scroll', arm, { passive: true });
    return () => {
      window.removeEventListener('scroll', arm);
      wrap?.removeEventListener('scroll', arm);
    };
  }, [pageMode, loadPage]);

  useEffect(() => {
    if (pageMode || !loadPage) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (!scrollArmed.current) return;
      scrollArmed.current = false;
      revealNext();
    }, { rootMargin: '120px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pageMode, loadPage, visibleCount, fetched.length, loading, error, hasMore]);

  const pageCount = Math.max(1, Math.ceil(total / UI_BATCH));
  const safePage = Math.min(currentPage, pageCount);
  const rangeStart = total === 0 ? 0 : ((safePage - 1) * UI_BATCH) + 1;
  const rangeEnd = Math.min(safePage * UI_BATCH, total);

  const items = useMemo(() => {
    if (pageMode) {
      const start = (safePage - 1) * UI_BATCH;
      return fetched.slice(start, start + UI_BATCH);
    }
    return fetched.slice(0, visibleCount);
  }, [fetched, visibleCount, pageMode, safePage]);

  const reachedEnd = !loading && !error && fetched.length >= total && visibleCount >= fetched.length && total > 0;

  return {
    items,
    loaded: fetched,
    total,
    loading,
    error,
    retry,
    sentinelRef,
    tableWrapRef,
    reachedEnd,
    currentPage: safePage,
    pageCount,
    rangeStart,
    rangeEnd,
    goToPage,
    refresh: () => fetchBatch(1, true),
    removeByKey(value) {
      const key = latest.current.itemKey;
      setFetched((previous) => previous.filter((item) => item[key] !== value));
      setTotal((current) => Math.max(0, current - 1));
    },
  };
}
