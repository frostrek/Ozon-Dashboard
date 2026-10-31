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
}) {
  const [fetched, setFetched] = useState(initialItems);
  const [visibleCount, setVisibleCount] = useState(Math.min(UI_BATCH, initialItems.length));
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
  latest.current = { fetched, visibleCount, total, nextPage, hasMore, loadPage, itemKey };

  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      setFetched(initialItems);
      setTotal(initialTotal);
      return;
    }
    setFetched(initialItems);
    setVisibleCount(Math.min(UI_BATCH, initialItems.length));
    setTotal(initialTotal);
    setNextPage(2);
    setError('');
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
      if (replace) setVisibleCount(Math.min(UI_BATCH, incoming.length));
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
  }, []);

  useEffect(() => {
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
  }, [visibleCount, fetched.length, loading, error, hasMore]);

  const items = useMemo(() => fetched.slice(0, visibleCount), [fetched, visibleCount]);
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
  };
}
