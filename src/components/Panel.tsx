import type { PropsWithChildren, ReactNode } from 'react';

type PanelProps = PropsWithChildren<{
  title?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function Panel({ children, title, actions, className }: PanelProps) {
  return (
    <section className={`card p-5 sm:p-6 ${className ?? ''}`}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          {title ? (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          ) : (
            <div />
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
