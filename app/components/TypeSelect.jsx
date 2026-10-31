'use client';

import { useEffect, useId, useRef, useState } from 'react';
import FloatPop from './FloatPop';

export default function TypeSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const selected = options.find((option) => option.id === value) || options[0];
  const query = text.trim().toLowerCase();
  const matches = options.filter((option) => option.label.toLowerCase().includes(query));

  useEffect(() => {
    if (!open) return undefined;
    setText('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    function close(event) {
      if (rootRef.current?.contains(event.target) || popRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  function choose(option) {
    onChange(option.id);
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(matches.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={`type-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button type="button" className="type-select-btn" aria-label={label} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || label}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <FloatPop anchorRef={rootRef} popRef={popRef} className="type-select-pop is-float">
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => { setText(event.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Filter ${label}`}
            aria-controls={listId}
            aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
          />
          <ul id={listId} role="listbox">
            {matches.length === 0 ? <li className="type-select-empty">No matches</li> : matches.map((option, index) => (
              <li key={option.id || `empty-${index}`}>
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.id === value}
                  className={index === active ? 'is-active' : ''}
                  onMouseEnter={() => setActive(index)}
                  onPointerDown={(event) => { event.preventDefault(); choose(option); }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </FloatPop>
      ) : null}
    </div>
  );
}
