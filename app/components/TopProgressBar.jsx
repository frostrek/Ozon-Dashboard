'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or searchParams change, complete and hide progress bar
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Listen to global click events on internal navigation links
  useEffect(() => {
    function handleClick(e) {
      const target = e.target.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Ignore external links, downloads, hash links, new tabs
      if (
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        target.getAttribute('download') !== null ||
        target.getAttribute('target') === '_blank' ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if navigating to a different page
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl || href === window.location.pathname) {
        return;
      }

      // Start progress bar immediately
      setLoading(true);
      setProgress(25);

      const timers = [
        setTimeout(() => setProgress(50), 200),
        setTimeout(() => setProgress(75), 600),
        setTimeout(() => setProgress(88), 1500),
        setTimeout(() => setProgress(93), 3000),
        setTimeout(() => setProgress(96), 6000),
        // Safety timeout in case navigation is cancelled
        setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 30000),
      ];

      return () => {
        timers.forEach((t) => clearTimeout(t));
      };
    }

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '3px',
        zIndex: 999999,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: 'rgba(16, 117, 111, 0.1)',
      }}
      aria-hidden="true"
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #10756F 0%, #14B8A6 50%, #5EEAD4 100%)',
          boxShadow: '0 0 10px #5EEAD4, 0 0 5px #14B8A6',
          transition: progress === 100 ? 'width 0.15s ease-out, opacity 0.2s ease-out' : 'width 0.3s cubic-bezier(0.1, 0.8, 0.2, 1)',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

