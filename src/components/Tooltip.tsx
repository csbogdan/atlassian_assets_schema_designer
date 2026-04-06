'use client';
import type { ReactNode } from 'react';

type Props = {
  content: string;
  children: ReactNode;
  placement?: 'top' | 'bottom';
};

export function Tooltip({ content, children, placement = 'top' }: Props) {
  const posClass =
    placement === 'bottom'
      ? 'top-full mt-1'
      : 'bottom-full mb-1';
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        className={`pointer-events-none absolute ${posClass} left-1/2 z-50 -translate-x-1/2
                   hidden rounded bg-slate-900 px-2 py-1 text-xs text-white whitespace-nowrap
                   group-hover:block group-focus-within:block`}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
