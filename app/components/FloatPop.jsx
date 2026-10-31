'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function FloatPop({ anchorRef, popRef, className, role, align = 'left', children }) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const openUp = window.innerHeight - rect.bottom < 200;
      const next = {
        position: 'fixed',
        zIndex: 5000,
        minWidth: Math.max(rect.width, align === 'right' ? 140 : 220),
      };
      if (openUp) next.bottom = `${window.innerHeight - rect.top + 6}px`;
      else next.top = `${rect.bottom + 6}px`;
      if (align === 'right') next.right = `${window.innerWidth - rect.right}px`;
      else next.left = `${rect.left}px`;
      setStyle(next);
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, align]);

  if (!style) return null;
  return createPortal(
    <div ref={popRef} className={className} role={role} style={style}>
      {children}
    </div>,
    document.body,
  );
}
