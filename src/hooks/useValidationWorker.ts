'use client';

import { useEffect, useRef } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { applyStaging } from '@/domain/transformers/stagingFilter';
import type { Diagnostic } from '@/domain/model/types';

type WorkerResponse = { id: number; diagnostics: Diagnostic[] };

const DEBOUNCE_MS = 300;

export function useValidationWorker() {
  const document = useDocumentStore((state) => state.document);
  const revision = useDocumentStore((state) => state.revision);
  const stagedForDeletion = useDocumentStore((state) => state.stagedForDeletion);
  const setDiagnosticsFromWorker = useDocumentStore((state) => state.setDiagnosticsFromWorker);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/validation.worker.ts', import.meta.url),
    );
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      // Discard stale responses — only the latest request matters
      if (event.data.id === requestIdRef.current) {
        setDiagnosticsFromWorker(event.data.diagnostics);
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, [setDiagnosticsFromWorker]);

  useEffect(() => {
    if (!document || !workerRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const id = ++requestIdRef.current;
      // Validate the effective document (staged types excluded)
      const effectiveDocument = stagedForDeletion.length > 0
        ? applyStaging(document, stagedForDeletion)
        : document;
      workerRef.current?.postMessage({ id, type: 'validate', document: effectiveDocument });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, revision, stagedForDeletion]);
}
