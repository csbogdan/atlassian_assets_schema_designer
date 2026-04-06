/**
 * AssetsImportSourceApi
 *
 * Domain-level abstraction for the Atlassian Assets External Import API.
 * All callers use this interface; the fetch implementation lives below.
 *
 * Reference: https://dac-static.atlassian.com/cloud/assets/swagger.v3.json
 */

import type { AssetsImportDocument } from '@/domain/model/types';

// ─── Config status ────────────────────────────────────────────────────────────

export type ConfigStatus = 'IDLE' | 'DISABLED' | 'MISSING_MAPPING' | 'RUNNING';

export type ConfigStatusResult = {
  status: ConfigStatus;
  /** Raw response payload from the Atlassian API. */
  raw: Record<string, unknown>;
};

// ─── Async operation progress ─────────────────────────────────────────────────

export type ProgressStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export type ProgressResult = {
  resourceId: string;
  status: ProgressStatus;
  progressPercentage?: number;
  message?: string;
  raw: Record<string, unknown>;
};

// ─── PUT/PATCH results ────────────────────────────────────────────────────────

export type ApiResult = {
  /** For async operations, the resourceId to poll for progress. */
  resourceId?: string;
  /** HTTP status code from Atlassian. */
  httpStatus: number;
  raw: Record<string, unknown>;
};

// ─── Interface ────────────────────────────────────────────────────────────────

export interface AssetsImportSourceApi {
  /**
   * GET /workspace/{workspaceId}/v1/importsource/{importSourceId}/schema-and-mapping
   */
  getSchemaAndMapping(
    workspaceId: string,
    importSourceId: string,
  ): Promise<AssetsImportDocument>;

  /**
   * PUT /workspace/{workspaceId}/v1/importsource/{importSourceId}/mapping
   * Replaces the full mapping. Set async=true to receive a resourceId for polling.
   */
  putMapping(
    workspaceId: string,
    importSourceId: string,
    doc: AssetsImportDocument,
    options?: { async?: boolean },
  ): Promise<ApiResult>;

  /**
   * PATCH /workspace/{workspaceId}/v1/importsource/{importSourceId}/mapping
   * Partially updates the mapping.
   */
  patchMapping(
    workspaceId: string,
    importSourceId: string,
    patch: Partial<AssetsImportDocument>,
    options?: { async?: boolean },
  ): Promise<ApiResult>;

  /**
   * GET /workspace/{workspaceId}/v1/importsource/{importSourceId}/mapping/progress/{resourceId}
   */
  getMappingProgress(
    workspaceId: string,
    importSourceId: string,
    resourceId: string,
  ): Promise<ProgressResult>;

  /**
   * GET /workspace/{workspaceId}/v1/importsource/{importSourceId}/configstatus
   */
  getConfigStatus(
    workspaceId: string,
    importSourceId: string,
  ): Promise<ConfigStatusResult>;
}

// ─── Fetch implementation ─────────────────────────────────────────────────────

const WORKSPACE_BASE = (workspaceId: string) =>
  `https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1`;

async function atlasFetch<T = Record<string, unknown>>(
  url: string,
  token: string,
  options?: RequestInit,
): Promise<{ status: number; body: T }> {
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  const text = await r.text().catch(() => '');
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }

  if (!r.ok) {
    throw new Error(`Atlassian API ${r.status}: ${text.slice(0, 400)}`);
  }

  return { status: r.status, body };
}

function normaliseProgress(raw: Record<string, unknown>): ProgressResult {
  const resourceId = String(raw['resourceId'] ?? raw['id'] ?? '');
  const statusRaw = String(raw['status'] ?? '').toUpperCase();
  const statusMap: Record<string, ProgressStatus> = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    DONE: 'DONE',
    COMPLETED: 'DONE',
    FAILED: 'FAILED',
    ERROR: 'FAILED',
  };
  const status: ProgressStatus = statusMap[statusRaw] ?? 'PENDING';
  const progressPercentage =
    typeof raw['progressPercentage'] === 'number' ? raw['progressPercentage'] : undefined;
  const message = typeof raw['message'] === 'string' ? raw['message'] : undefined;
  return { resourceId, status, progressPercentage, message, raw };
}

function normaliseConfigStatus(raw: Record<string, unknown>): ConfigStatusResult {
  const allowed = new Set<ConfigStatus>(['IDLE', 'DISABLED', 'MISSING_MAPPING', 'RUNNING']);
  const candidate = String(raw['status'] ?? '').toUpperCase() as ConfigStatus;
  const status: ConfigStatus = allowed.has(candidate) ? candidate : 'IDLE';
  return { status, raw };
}

/**
 * Creates a fetch-based implementation of AssetsImportSourceApi.
 * Pass the Bearer token obtained from the user's project settings.
 */
export function createAssetsImportSourceApi(token: string): AssetsImportSourceApi {
  return {
    async getSchemaAndMapping(workspaceId, importSourceId) {
      const url = `${WORKSPACE_BASE(workspaceId)}/importsource/${importSourceId}/schema-and-mapping`;
      const { body } = await atlasFetch<AssetsImportDocument>(url, token);
      return body;
    },

    async putMapping(workspaceId, importSourceId, doc, options) {
      const asyncFlag = options?.async ?? false;
      const url =
        `${WORKSPACE_BASE(workspaceId)}/importsource/${importSourceId}/mapping` +
        (asyncFlag ? '?async=true' : '');
      const { status, body } = await atlasFetch<Record<string, unknown>>(url, token, {
        method: 'PUT',
        body: JSON.stringify(doc),
      });
      const resourceId = typeof body['resourceId'] === 'string' ? body['resourceId'] : undefined;
      return { httpStatus: status, resourceId, raw: body };
    },

    async patchMapping(workspaceId, importSourceId, patch, options) {
      const asyncFlag = options?.async ?? false;
      const url =
        `${WORKSPACE_BASE(workspaceId)}/importsource/${importSourceId}/mapping` +
        (asyncFlag ? '?async=true' : '');
      const { status, body } = await atlasFetch<Record<string, unknown>>(url, token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const resourceId = typeof body['resourceId'] === 'string' ? body['resourceId'] : undefined;
      return { httpStatus: status, resourceId, raw: body };
    },

    async getMappingProgress(workspaceId, importSourceId, resourceId) {
      const url = `${WORKSPACE_BASE(workspaceId)}/importsource/${importSourceId}/mapping/progress/${resourceId}`;
      const { body } = await atlasFetch<Record<string, unknown>>(url, token);
      return normaliseProgress(body);
    },

    async getConfigStatus(workspaceId, importSourceId) {
      const url = `${WORKSPACE_BASE(workspaceId)}/importsource/${importSourceId}/configstatus`;
      const { body } = await atlasFetch<Record<string, unknown>>(url, token);
      return normaliseConfigStatus(body);
    },
  };
}
