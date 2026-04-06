import { validateDocument } from '@/domain/validators/validateDocument';
import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';

type ValidateRequest = { id: number; type: 'validate'; document: AssetsImportDocument };
type WorkerResponse = { id: number; diagnostics: Diagnostic[] };

/* eslint-disable no-restricted-globals */
self.onmessage = (event: MessageEvent<ValidateRequest>) => {
  const { id, document } = event.data;
  const diagnostics = validateDocument(document);
  (self as unknown as { postMessage(data: WorkerResponse): void }).postMessage({ id, diagnostics });
};
