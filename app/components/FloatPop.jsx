'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function FloatPop({ anchorRef, popRef, className, role, align = 'left', children }) {
  const [style, setStyle] = useState({
    position: 'fixed',
    zIndex: 8000,
    top: 0,
    left: 0,
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const popHeight = popRef.current?.offsetHeight || 280;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < Math.min(popHeight, 240) && spaceAbove > spaceBelow;
      const available = Math.max(140, openUp ? spaceAbove : spaceBelow);
      const width = Math.max(rect.width, align === 'right' ? 140 : 220);
      const next = {
        position: 'fixed',
        zIndex: 8000,
        minWidth: width,
        maxWidth: `${Math.max(180, window.innerWidth - 16)}px`,
        maxHeight: `${Math.min(320, available)}px`,
        overflow: 'auto',
        top: 'auto',
        bottom: 'auto',
        left: 'auto',
        right: 'auto',
        visibility: 'visible',
      };
      if (openUp) next.bottom = `${window.innerHeight - rect.top + gap}px`;
      else next.top = `${rect.bottom + gap}px`;
      if (align === 'right') {
        next.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      } else {
        next.left = `${Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))}px`;
      }
      setStyle(next);
    }
    place();
    const timer = window.requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.cancelAnimationFrame(timer);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, popRef, align]);

  return createPortal(
    <div ref={popRef} className={className} role={role} style={style}>
      {children}
    </div>,
    document.body,
  );
}
