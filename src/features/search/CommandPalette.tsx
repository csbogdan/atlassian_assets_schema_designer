'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { buildSearchIndex, type SearchResult } from '@/domain/selectors/searchIndex';

export function CommandPalette() {
  const document = useDocumentStore((state) => state.document);
  const setActiveView = useDocumentStore((state) => state.setActiveView);
  const setSelectedObjectTypeExternalId = useDocumentStore((state) => state.setSelectedObjectTypeExternalId);
  const setFocusedPath = useDocumentStore((state) => state.setFocusedPath);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const searchIndex = useMemo(
    () => (document ? buildSearchIndex(document) : []),
    [document],
  );

  const filteredResults = useMemo<SearchResult[]>(() => {
    if (!query.trim()) {
      return searchIndex.slice(0, 8);
    }

    const lower = query.toLowerCase();
    return searchIndex
      .filter(
        (result) =>
          result.name.toLowerCase().includes(lower) ||
          result.externalId.toLowerCase().includes(lower),
      )
      .slice(0, 8);
  }, [searchIndex, query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(0);
  }, []);

  const selectResult = useCallback(
    (result: SearchResult) => {
      setActiveView('schema');

      if (result.kind === 'objectType') {
        setSelectedObjectTypeExternalId(result.externalId);
      } else {
        setSelectedObjectTypeExternalId(result.objectTypeExternalId);
      }

      setFocusedPath(result.jsonPath);
      close();
    },
    [close, setActiveView, setFocusedPath, setSelectedObjectTypeExternalId],
  );

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setHighlightedIndex(0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredResults.length]);

  if (!isOpen) {
    return null;
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        filteredResults.length === 0 ? 0 : (prev + 1) % filteredResults.length,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        filteredResults.length === 0 ? 0 : (prev - 1 + filteredResults.length) % filteredResults.length,
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const result = filteredResults[highlightedIndex];
      if (result) {
        selectResult(result);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={close}
    >
      <div
        className="mx-auto mt-24 max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <svg
              className="h-4 w-4 shrink-0 text-slate-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
              placeholder="Search object types and attributes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search"
              aria-autocomplete="list"
              aria-controls="command-palette-results"
              aria-activedescendant={
                filteredResults[highlightedIndex]
                  ? `cp-result-${highlightedIndex}`
                  : undefined
              }
            />
            <kbd
              className="hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 sm:inline"
              aria-label="Press escape to close"
            >
              Esc
            </kbd>
          </div>

          {!document ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No document loaded.
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul
              id="command-palette-results"
              className="max-h-80 overflow-auto py-2"
              role="listbox"
              aria-label="Search results"
            >
              {filteredResults.map((result, index) => (
                <li
                  key={`${result.kind}-${result.externalId}-${index}`}
                  id={`cp-result-${index}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${
                    index === highlightedIndex
                      ? 'bg-slate-100'
                      : 'hover:bg-slate-50'
                  }`}
                  onClick={() => selectResult(result)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                      result.kind === 'objectType'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                    aria-label={result.kind === 'objectType' ? 'Object Type' : 'Attribute'}
                  >
                    {result.kind === 'objectType' ? 'T' : 'A'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {result.name}
                    </div>
                    <div className="flex items-center gap-1 truncate">
                      <span className="text-xs text-slate-400">{result.externalId}</span>
                      {result.kind === 'attribute' ? (
                        <>
                          <span className="text-xs text-slate-300">&middot;</span>
                          <span className="truncate text-xs text-slate-400">
                            {result.objectTypeName}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            <span><kbd className="font-medium">↑↓</kbd> navigate</span>
            <span><kbd className="font-medium">↵</kbd> select</span>
            <span><kbd className="font-medium">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
