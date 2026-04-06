import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AssetsImportDocument, Diagnostic, ObjectTypeDefinition, ProjectEnvironment, ProjectSettings } from '@/domain/model/types';
import { createBlankDocument } from '@/domain/model/factory';
import { parseAssetsImportDocument } from '@/domain/normalizers/normalizeAssetsImportDocument';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { validateDocument } from '@/domain/validators/validateDocument';
import { applySafeAutofix } from '@/domain/transformers/safeAutofix';
import { applyStaging, collectSubtreeIds } from '@/domain/transformers/stagingFilter';
import { VALIDATION_RULES } from '@/domain/validators/validationRules';

export type AppView = 'project' | 'dashboard' | 'schema' | 'mapping' | 'validation' | 'generator' | 'diff' | 'tools' | 'raw-json' | 'settings';

export type ProjectVersion = {
  id: string;
  name: string;
  createdAt: string;
  document: AssetsImportDocument;
};

export type ProjectActivity = {
  id: string;
  at: string;
  action: string;
  detail: string;
  by?: string;
};

export type DiskProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  status: 'open' | 'closed' | 'archived';
  ownerId?: string;
  global: boolean;
  /** Present only for the owner — emails explicitly granted read access. */
  sharedWith?: string[];
};

export type DocumentStoreState = {
  rawJson: string;
  document?: AssetsImportDocument;
  diagnostics: Diagnostic[];
  projectId: string;
  projectName: string;
  projectStatus: 'open' | 'closed' | 'archived';
  projectCreatedAt: string;
  diskProjectId?: string;
  diskLastSyncedAt?: string;
  diskProjects: DiskProjectSummary[];
  projectVersions: ProjectVersion[];
  baselineSnapshots: ProjectVersion[];
  projectActivity: ProjectActivity[];
  revision: number;
  undoStack: AssetsImportDocument[];
  redoStack: AssetsImportDocument[];
  dirty: boolean;
  activeView: AppView;
  focusedPath?: string;
  selectedObjectTypeExternalId?: string;
  selectedMappingExternalId?: string;
  diskApiError?: string;
  validationPending: boolean;
  validationConfig: Record<string, boolean>;
  projectSettings: ProjectSettings;
  currentUserEmail?: string;
  rawJsonParseError?: string;
  deferredDiagnostics: Array<{ code: string; path: string }>;
  stagedForDeletion: string[];
  environments: ProjectEnvironment[];
  addEnvironment: (env: { name: string; token: string }) => void;
  updateEnvironment: (id: string, patch: { name?: string; token?: string }) => void;
  removeEnvironment: (id: string) => void;
  setRawJsonParseError: (error: string | undefined) => void;
  deferDiagnostic: (code: string, path: string) => void;
  undeferDiagnostic: (code: string, path: string) => void;
  clearAllDeferredDiagnostics: () => void;
  setCurrentUser: (email: string | undefined) => void;
  setProjectSettings: (settings: Partial<ProjectSettings>) => void;
  setDiagnosticsFromWorker: (diagnostics: Diagnostic[]) => void;
  setValidationRuleEnabled: (code: string, enabled: boolean) => void;
  setAllValidationRulesEnabled: (enabled: boolean) => void;
  resetValidationConfig: () => void;
  setRawJson: (rawJson: string) => void;
  clearDiskApiError: () => void;
  setActiveView: (view: AppView) => void;
  setFocusedPath: (path?: string) => void;
  setSelectedObjectTypeExternalId: (externalId?: string) => void;
  setSelectedMappingExternalId: (externalId?: string) => void;
  undoDocument: () => void;
  redoDocument: () => void;
  saveBaselineSnapshot: (name?: string) => void;
  deleteBaselineSnapshot: (id: string) => void;
  createProjectFromScratch: (name?: string) => Promise<void>;
  saveProjectVersion: (name?: string) => void;
  restoreProjectVersion: (versionId: string) => void;
  renameProject: (name: string) => void;
  refreshDiskProjects: () => Promise<void>;
  createDiskProject: (name?: string, document?: AssetsImportDocument) => Promise<void>;
  loadDiskProject: (id: string) => Promise<void>;
  saveDiskProject: () => Promise<{ ok: boolean; message: string }>;
  closeDiskProject: () => Promise<void>;
  setDiskProjectStatus: (id: string, status: 'open' | 'closed' | 'archived') => Promise<void>;
  setDiskProjectGlobal: (id: string, global: boolean) => Promise<void>;
  deleteDiskProject: (id: string) => Promise<void>;
  exportDiskProject: (id?: string) => Promise<void>;
  loadDocument: (input: string, options?: { preserveRawJson?: boolean; markDirty?: boolean }) => void;
  updateDocument: (updater: (document: AssetsImportDocument) => AssetsImportDocument) => void;
  applySafeAutofixAction: (diagnostic: Diagnostic) => void;
  stageObjectType: (externalId: string) => void;
  unstageObjectType: (externalId: string) => void;
  clearStagedDeletions: () => void;
  commitStagedDeletions: () => void;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendActivity(
  activity: ProjectActivity[],
  action: string,
  detail: string,
  by?: string,
): ProjectActivity[] {
  const next: ProjectActivity = {
    id: newId('activity'),
    at: new Date().toISOString(),
    action,
    detail,
    ...(by ? { by } : {}),
  };
  return [next, ...activity].slice(0, 200);
}

function deepCloneDocument(document: AssetsImportDocument): AssetsImportDocument {
  return JSON.parse(JSON.stringify(document)) as AssetsImportDocument;
}

function deepCloneObjectType(objectType: ObjectTypeDefinition): ObjectTypeDefinition {
  return {
    ...objectType,
    attributes: objectType.attributes?.map((attribute) => ({ ...attribute })),
    children: objectType.children?.map((child) => deepCloneObjectType(child)),
  };
}

function rewriteReferenceTargets(
  objectTypes: AssetsImportDocument['schema']['objectSchema']['objectTypes'],
  oldExternalId: string,
  newExternalId: string,
) {
  objectTypes.forEach((objectType) => {
    objectType.attributes = objectType.attributes?.map((attribute) => {
      if (attribute.type === 'referenced_object' && attribute.referenceObjectTypeExternalId === oldExternalId) {
        return {
          ...attribute,
          referenceObjectTypeExternalId: newExternalId,
        };
      }

      return attribute;
    });

    if (objectType.children?.length) {
      rewriteReferenceTargets(objectType.children, oldExternalId, newExternalId);
    }
  });
}

function normalizeDocumentAfterRename(
  previous: AssetsImportDocument,
  next: AssetsImportDocument,
): AssetsImportDocument {
  const prevFlattened = flattenObjectTypes(previous.schema.objectSchema.objectTypes);
  const nextFlattened = flattenObjectTypes(next.schema.objectSchema.objectTypes);
  const renameByPath = new Map<string, {
    oldExternalId: string;
    newExternalId: string;
    oldName: string;
    newName: string;
    attributeRenames: Array<{ oldExternalId: string; newExternalId: string; oldName: string; newName: string }>;
  }>();

  nextFlattened.forEach((nextItem) => {
    const previousItem = prevFlattened.find((candidate) => candidate.jsonPath === nextItem.jsonPath);
    if (!previousItem) {
      return;
    }

    const previousAttributes = previousItem.objectType.attributes ?? [];
    const nextAttributes = nextItem.objectType.attributes ?? [];
    const attributeRenames: Array<{ oldExternalId: string; newExternalId: string; oldName: string; newName: string }> = [];

    // Match attributes by externalId to detect renames. If an attribute disappears
    // by ID and a new one appears at the same array position, treat it as a rename.
    // Matching by ID first prevents position-drift from corrupting unrelated mappings.
    const prevById = new Map(previousAttributes.map((a) => [a.externalId, a]));
    const nextById = new Map(nextAttributes.map((a) => [a.externalId, a]));

    nextAttributes.forEach((attribute, index) => {
      // If this externalId already existed unchanged, skip.
      if (prevById.has(attribute.externalId)) {
        const prevAttr = prevById.get(attribute.externalId)!;
        if (prevAttr.name !== attribute.name) {
          // Same ID, different name — name-only rename.
          attributeRenames.push({
            oldExternalId: prevAttr.externalId,
            newExternalId: attribute.externalId,
            oldName: prevAttr.name,
            newName: attribute.name,
          });
        }
        return;
      }

      // New externalId — check whether the attribute at the same position had a
      // different ID (i.e. the user renamed the ID and possibly the name).
      const previousAttribute = previousAttributes[index];
      if (!previousAttribute || nextById.has(previousAttribute.externalId)) {
        // The old attribute still exists elsewhere, so this is a new attribute, not a rename.
        return;
      }

      attributeRenames.push({
        oldExternalId: previousAttribute.externalId,
        newExternalId: attribute.externalId,
        oldName: previousAttribute.name,
        newName: attribute.name,
      });
    });

    if (
      previousItem.objectType.externalId !== nextItem.objectType.externalId
      || previousItem.objectType.name !== nextItem.objectType.name
      || attributeRenames.length > 0
    ) {
      renameByPath.set(nextItem.jsonPath, {
        oldExternalId: previousItem.objectType.externalId,
        newExternalId: nextItem.objectType.externalId,
        oldName: previousItem.objectType.name,
        newName: nextItem.objectType.name,
        attributeRenames,
      });
    }
  });

  if (renameByPath.size === 0) {
    return next;
  }

  const rewrittenObjectTypes = next.schema.objectSchema.objectTypes.map((objectType) => deepCloneObjectType(objectType));
  const rewrittenMappings = next.mapping.objectTypeMappings.map((mapping) => ({
    ...mapping,
    attributesMapping: mapping.attributesMapping.map((attributeMapping) => ({ ...attributeMapping })),
  }));

  renameByPath.forEach((rename) => {
    if (rename.oldExternalId !== rename.newExternalId) {
      rewriteReferenceTargets(rewrittenObjectTypes, rename.oldExternalId, rename.newExternalId);
    }

    rewrittenMappings.forEach((mapping) => {
      if (mapping.objectTypeExternalId === rename.oldExternalId) {
        mapping.objectTypeExternalId = rename.newExternalId;
      }

      if (mapping.objectTypeExternalId === rename.newExternalId && mapping.objectTypeName === rename.oldName) {
        mapping.objectTypeName = rename.newName;
      }

      if (mapping.objectTypeExternalId !== rename.newExternalId) {
        return;
      }

      rename.attributeRenames.forEach((attributeRename) => {
        mapping.attributesMapping.forEach((attributeMapping) => {
          if (attributeMapping.attributeExternalId === attributeRename.oldExternalId) {
            attributeMapping.attributeExternalId = attributeRename.newExternalId;
          }

          if (attributeMapping.attributeName === attributeRename.oldName) {
            attributeMapping.attributeName = attributeRename.newName;
          }
        });
      });
    });
  });

  return {
    ...next,
    schema: {
      ...next.schema,
      objectSchema: {
        ...next.schema.objectSchema,
        objectTypes: rewrittenObjectTypes,
      },
    },
    mapping: {
      ...next.mapping,
      objectTypeMappings: rewrittenMappings,
    },
  };
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

let _quotaExceededHandler: (() => void) | undefined;

/** Register a callback to be invoked when localStorage quota is exceeded. */
export function setLocalStorageQuotaHandler(fn: () => void): void {
  _quotaExceededHandler = fn;
}

/** Wraps localStorage with SSR safety. */
const safeLocalStorage: StateStorage = typeof window === 'undefined'
  ? noopStorage
  : {
    getItem: (name) => {
      try { return localStorage.getItem(name); } catch { return null; }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch (error) {
        if (error instanceof DOMException) {
          console.warn('[jsm-schema] localStorage quota exceeded; state not persisted.');
          _quotaExceededHandler?.();
        }
      }
    },
    removeItem: (name) => {
      try { localStorage.removeItem(name); } catch { /* ignore */ }
    },
  };

export const useDocumentStore = create<DocumentStoreState>()(persist((set) => ({
  rawJson: '',
  diagnostics: [],
  projectId: newId('project'),
  projectName: 'Untitled Project',
  projectStatus: 'open',
  projectCreatedAt: new Date().toISOString(),
  diskProjectId: undefined,
  diskLastSyncedAt: undefined,
  diskProjects: [],
  projectVersions: [],
  baselineSnapshots: [],
  projectActivity: [],
  revision: 0,
  dirty: false,
  activeView: 'project',
  undoStack: [],
  redoStack: [],
  diskApiError: undefined,
  validationPending: false,
  validationConfig: {},
  projectSettings: {},
  currentUserEmail: undefined,
  rawJsonParseError: undefined,
  deferredDiagnostics: [],
  stagedForDeletion: [],
  environments: [],
  addEnvironment: ({ name, token }) => set((state) => ({
    environments: [...state.environments, { id: newId('env'), name: name.trim(), token }],
    dirty: true,
  })),
  updateEnvironment: (id, patch) => set((state) => ({
    environments: state.environments.map((e) =>
      e.id === id ? { ...e, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.token !== undefined ? { token: patch.token } : {}) } : e,
    ),
    dirty: true,
  })),
  removeEnvironment: (id) => set((state) => ({
    environments: state.environments.filter((e) => e.id !== id),
    dirty: true,
  })),
  setRawJsonParseError: (error) => set({ rawJsonParseError: error }),
  deferDiagnostic: (code, path) => set((state) => {
    const alreadyDeferred = state.deferredDiagnostics.some(
      (d) => d.code === code && d.path === path,
    );
    if (alreadyDeferred) return state;
    return { deferredDiagnostics: [...state.deferredDiagnostics, { code, path }] };
  }),
  undeferDiagnostic: (code, path) => set((state) => ({
    deferredDiagnostics: state.deferredDiagnostics.filter(
      (d) => !(d.code === code && d.path === path),
    ),
  })),
  clearAllDeferredDiagnostics: () => set({ deferredDiagnostics: [] }),
  setCurrentUser: (email) => set({ currentUserEmail: email }),
  setDiagnosticsFromWorker: (diagnostics) => set({ diagnostics, validationPending: false }),
  setValidationRuleEnabled: (code, enabled) => set((state) => ({
    validationConfig: { ...state.validationConfig, [code]: enabled },
  })),
  setAllValidationRulesEnabled: (enabled) => set((state) => {
    const next: Record<string, boolean> = {};
    for (const key of Object.keys(state.validationConfig)) {
      next[key] = enabled;
    }
    // Also explicitly set all known rules
    for (const rule of VALIDATION_RULES) {
      next[rule.code] = enabled;
    }
    return { validationConfig: next };
  }),
  resetValidationConfig: () => set({ validationConfig: {} }),
  setProjectSettings: (settings) => set((state) => ({
    projectSettings: { ...state.projectSettings, ...settings },
  })),
  setRawJson: (rawJson) => set({ rawJson }),
  setActiveView: (view) => set({ activeView: view }),
  setFocusedPath: (path) => set({ focusedPath: path }),
  setSelectedObjectTypeExternalId: (externalId) => set({ selectedObjectTypeExternalId: externalId }),
  setSelectedMappingExternalId: (externalId) => set({ selectedMappingExternalId: externalId }),
  clearDiskApiError: () => set({ diskApiError: undefined }),
  undoDocument: () => set((state) => {
    if (!state.document || state.undoStack.length === 0) {
      return state;
    }

    const previous = state.undoStack[state.undoStack.length - 1];

    return {
      ...state,
      document: deepCloneDocument(previous),
      rawJson: JSON.stringify(previous, null, 2),
      validationPending: true,
      selectedObjectTypeExternalId: undefined,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, deepCloneDocument(state.document)].slice(-50),
      revision: state.revision + 1,
      dirty: true,
      projectActivity: appendActivity(state.projectActivity, 'UNDO', 'Reverted last change.', state.currentUserEmail),
    };
  }),
  redoDocument: () => set((state) => {
    if (!state.document || state.redoStack.length === 0) {
      return state;
    }

    const next = state.redoStack[state.redoStack.length - 1];

    return {
      ...state,
      document: deepCloneDocument(next),
      rawJson: JSON.stringify(next, null, 2),
      validationPending: true,
      selectedObjectTypeExternalId: undefined,
      undoStack: [...state.undoStack, deepCloneDocument(state.document)].slice(-50),
      redoStack: state.redoStack.slice(0, -1),
      revision: state.revision + 1,
      dirty: true,
      projectActivity: appendActivity(state.projectActivity, 'REDO', 'Reapplied reverted change.', state.currentUserEmail),
    };
  }),
  saveBaselineSnapshot: (name) => set((state) => {
    if (!state.document) {
      return state;
    }

    const baseline: ProjectVersion = {
      id: newId('baseline'),
      name: name?.trim() || `Baseline ${state.baselineSnapshots.length + 1}`,
      createdAt: new Date().toISOString(),
      document: deepCloneDocument(state.document),
    };

    return {
      ...state,
      baselineSnapshots: [baseline, ...state.baselineSnapshots].slice(0, 30),
      projectActivity: appendActivity(state.projectActivity, 'BASELINE_SAVED', `Saved baseline ${baseline.name}.`, state.currentUserEmail),
    };
  }),
  deleteBaselineSnapshot: (id) => set((state) => ({
    ...state,
    baselineSnapshots: state.baselineSnapshots.filter((baseline) => baseline.id !== id),
    projectActivity: appendActivity(state.projectActivity, 'BASELINE_DELETED', 'Deleted baseline snapshot.', state.currentUserEmail),
  })),
  renameProject: (name) => set((state) => ({
    projectName: name,
    dirty: true,
    projectActivity: appendActivity(state.projectActivity, 'PROJECT_RENAMED', `Renamed project to "${name}".`, state.currentUserEmail),
  })),
  refreshDiskProjects: async () => {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      set({ diskApiError: 'Failed to refresh project list from disk.' });
      return;
    }
    const body = await response.json() as { projects: DiskProjectSummary[] };
    set({ diskProjects: body.projects });
  },
  createDiskProject: async (name, document) => {
    const currentState = useDocumentStore.getState();
    const currentBaselines = currentState.baselineSnapshots;
    const currentValidationConfig = currentState.validationConfig;

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name?.trim() || 'Untitled Project',
        document,
        baselines: currentBaselines,
        validationConfig: currentValidationConfig,
        projectSettings: currentState.projectSettings,
      }),
    });

    if (!response.ok) {
      return;
    }

    const body = await response.json() as {
      project: {
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        revision: number;
        status: 'open' | 'closed' | 'archived';
        document: AssetsImportDocument;
        versions: ProjectVersion[];
        baselines: ProjectVersion[];
        activity: ProjectActivity[];
        validationConfig?: Record<string, boolean>;
        projectSettings?: ProjectSettings;
        stagedForDeletion?: string[];
        environments?: ProjectEnvironment[];
      };
    };

    const staged = body.project.stagedForDeletion ?? [];
    const docForValidation = applyStaging(body.project.document, staged);
    set({
      projectId: body.project.id,
      projectName: body.project.name,
      projectStatus: body.project.status,
      projectCreatedAt: body.project.createdAt,
      diskProjectId: body.project.id,
      diskLastSyncedAt: body.project.updatedAt,
      projectVersions: body.project.versions,
      baselineSnapshots: body.project.baselines ?? [],
      projectActivity: body.project.activity,
      undoStack: [],
      redoStack: [],
      revision: body.project.revision,
      dirty: false,
      document: body.project.document,
      rawJson: JSON.stringify(body.project.document, null, 2),
      diagnostics: validateDocument(docForValidation),
      activeView: 'schema',
      validationConfig: body.project.validationConfig ?? {},
      projectSettings: body.project.projectSettings ?? {},
      stagedForDeletion: staged,
      environments: body.project.environments ?? [],
    });

    await useDocumentStore.getState().refreshDiskProjects();
  },
  loadDiskProject: async (id) => {
    const response = await fetch(`/api/projects/${id}`);
    if (!response.ok) {
      set({ diskApiError: `Failed to load project "${id}" from disk.` });
      return;
    }
    const body = await response.json() as {
      project: {
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        revision: number;
        status: 'open' | 'closed' | 'archived';
        document: AssetsImportDocument;
        versions: ProjectVersion[];
        baselines: ProjectVersion[];
        activity: ProjectActivity[];
        validationConfig?: Record<string, boolean>;
        projectSettings?: ProjectSettings;
        stagedForDeletion?: string[];
        environments?: ProjectEnvironment[];
      };
    };

    const staged = body.project.stagedForDeletion ?? [];
    const docForValidation = applyStaging(body.project.document, staged);
    set({
      projectId: body.project.id,
      projectName: body.project.name,
      projectStatus: body.project.status,
      projectCreatedAt: body.project.createdAt,
      diskProjectId: body.project.id,
      diskLastSyncedAt: body.project.updatedAt,
      projectVersions: body.project.versions,
      baselineSnapshots: body.project.baselines ?? [],
      projectActivity: body.project.activity,
      undoStack: [],
      redoStack: [],
      revision: body.project.revision,
      dirty: false,
      document: body.project.document,
      rawJson: JSON.stringify(body.project.document, null, 2),
      diagnostics: validateDocument(docForValidation),
      activeView: 'schema',
      validationConfig: body.project.validationConfig ?? {},
      projectSettings: body.project.projectSettings ?? {},
      stagedForDeletion: staged,
      environments: body.project.environments ?? [],
    });
  },
  saveDiskProject: async () => {
    const state = useDocumentStore.getState();
    if (!state.document || !state.diskProjectId) {
      return { ok: false, message: 'No disk-backed project loaded.' };
    }

    const response = await fetch(`/api/projects/${state.diskProjectId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: state.diskProjectId,
        name: state.projectName,
        createdAt: state.projectCreatedAt,
        revision: state.revision,
        status: state.projectStatus,
        document: state.document,
        versions: state.projectVersions,
        baselines: state.baselineSnapshots,
        activity: state.projectActivity,
        validationConfig: state.validationConfig,
        projectSettings: state.projectSettings,
        stagedForDeletion: state.stagedForDeletion,
        environments: state.environments,
        expectedUpdatedAt: state.diskLastSyncedAt,
      }),
    });

    if (response.status === 409) {
      const conflict = await response.json().catch(() => ({ error: 'Project changed externally.' })) as {
        error?: string;
        currentUpdatedAt?: string;
      };
      if (conflict.currentUpdatedAt) {
        set({ diskLastSyncedAt: conflict.currentUpdatedAt });
      }
      return { ok: false, message: conflict.error ?? 'Project changed externally. Reload and retry save.' };
    }

    if (!response.ok) {
      return { ok: false, message: 'Failed to save project to disk.' };
    }

    const body = await response.json() as {
      project: {
        revision: number;
        updatedAt: string;
      };
    };

    set((current) => ({
      dirty: false,
      revision: body.project.revision,
      diskLastSyncedAt: body.project.updatedAt,
      projectActivity: appendActivity(current.projectActivity, 'PROJECT_SAVED', 'Saved project to disk.', current.currentUserEmail),
    }));
    await useDocumentStore.getState().refreshDiskProjects();
    return { ok: true, message: 'Project saved to disk.' };
  },
  closeDiskProject: async () => {
    const state = useDocumentStore.getState();
    if (state.diskProjectId) {
      await fetch(`/api/projects/${state.diskProjectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
    }

    const blank = createBlankDocument();
    set({
      projectId: newId('project'),
      projectName: 'Untitled Project',
      projectStatus: 'open',
      projectCreatedAt: new Date().toISOString(),
      diskProjectId: undefined,
      diskLastSyncedAt: undefined,
      projectVersions: [],
      baselineSnapshots: [],
      projectActivity: [],
      undoStack: [],
      redoStack: [],
      revision: 0,
      dirty: false,
      document: blank,
      rawJson: JSON.stringify(blank, null, 2),
      diagnostics: validateDocument(blank),
      activeView: 'project',
      projectSettings: {},
      stagedForDeletion: [],
    });

    await useDocumentStore.getState().refreshDiskProjects();
  },
  setDiskProjectStatus: async (id, status) => {
    const patchResponse = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!patchResponse.ok) {
      set({ diskApiError: `Failed to update project status.` });
    }

    const state = useDocumentStore.getState();
    if (state.diskProjectId === id) {
      set({ projectStatus: status });
    }
    await useDocumentStore.getState().refreshDiskProjects();
  },
  setDiskProjectGlobal: async (id, global) => {
    const patchResponse = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ global }),
    });
    if (!patchResponse.ok) {
      set({ diskApiError: `Failed to update project sharing.` });
    }
    await useDocumentStore.getState().refreshDiskProjects();
  },
  deleteDiskProject: async (id) => {
    const deleteResponse = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!deleteResponse.ok) {
      set({ diskApiError: `Failed to delete project.` });
    }

    const state = useDocumentStore.getState();
    if (state.diskProjectId === id) {
      await state.closeDiskProject();
      return;
    }

    await useDocumentStore.getState().refreshDiskProjects();
  },
  exportDiskProject: async (id) => {
    const state = useDocumentStore.getState();
    const projectId = id ?? state.diskProjectId;
    if (!projectId) {
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/export`);
    if (!response.ok) {
      return;
    }
    const text = await response.text();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = id
      ? (state.diskProjects.find((item) => item.id === id)?.name ?? 'project').replace(/\s+/g, '-').toLowerCase()
      : state.projectName.replace(/\s+/g, '-').toLowerCase();
    link.download = `${fileName}-schema.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  createProjectFromScratch: async (name) => {
    await useDocumentStore.getState().createDiskProject(name);
  },
  saveProjectVersion: (name) => set((state) => {
    if (!state.document) {
      return state;
    }

    const nextVersion: ProjectVersion = {
      id: newId('version'),
      name: name?.trim() || `Version ${state.projectVersions.length + 1}`,
      createdAt: new Date().toISOString(),
      document: JSON.parse(JSON.stringify(state.document)) as AssetsImportDocument,
    };

    return {
      ...state,
      projectVersions: [nextVersion, ...state.projectVersions].slice(0, 30),
      dirty: true,
      projectActivity: appendActivity(state.projectActivity, 'VERSION_SAVED', `Saved ${nextVersion.name}.`, state.currentUserEmail),
    };
  }),
  restoreProjectVersion: (versionId) => set((state) => {
    const version = state.projectVersions.find((item) => item.id === versionId);
    if (!version) {
      return state;
    }

    return {
      ...state,
      document: JSON.parse(JSON.stringify(version.document)) as AssetsImportDocument,
      rawJson: JSON.stringify(version.document, null, 2),
      diagnostics: validateDocument(version.document),
      dirty: false,
      projectActivity: appendActivity(state.projectActivity, 'VERSION_RESTORED', `Restored ${version.name}.`, state.currentUserEmail),
      activeView: 'schema',
    };
  }),
  loadDocument: (input, options) => {
    const parsed = parseAssetsImportDocument(input);

    if (!parsed.document) {
      set({
        rawJson: parsed.rawJson,
        document: undefined,
        diagnostics: parsed.diagnostics,
        focusedPath: parsed.diagnostics[0]?.path,
      });
      return;
    }

    const rawJson = options?.preserveRawJson ? input : parsed.rawJson;
    const markDirty = options?.markDirty ?? true;
    const loadedDocument = parsed.document;

    set((state) => ({
      rawJson,
      document: loadedDocument,
      diagnostics: [...parsed.diagnostics, ...validateDocument(loadedDocument)],
      focusedPath: undefined,
      undoStack: state.document ? [...state.undoStack, deepCloneDocument(state.document)].slice(-50) : state.undoStack,
      redoStack: [],
      revision: state.revision + 1,
      dirty: markDirty,
    }));
  },
  updateDocument: (updater) => set((state) => {
    if (!state.document) {
      return state;
    }

    const updatedDocument = updater(state.document);
    const nextDocument = normalizeDocumentAfterRename(state.document, updatedDocument);

    return {
      ...state,
      document: nextDocument,
      rawJson: JSON.stringify(nextDocument, null, 2),
      validationPending: true,
      undoStack: [...state.undoStack, deepCloneDocument(state.document)].slice(-50),
      redoStack: [],
      revision: state.revision + 1,
      dirty: true,
    };
  }),
  applySafeAutofixAction: (diagnostic) => set((state) => {
    if (!state.document || state.baselineSnapshots.length === 0) {
      return state;
    }

    const latestBaseline = state.baselineSnapshots[0];
    const nextDocument = applySafeAutofix(state.document, latestBaseline.document, diagnostic);

    if (nextDocument === state.document) {
      return state;
    }

    return {
      ...state,
      document: nextDocument,
      rawJson: JSON.stringify(nextDocument, null, 2),
      validationPending: true,
      undoStack: [...state.undoStack, deepCloneDocument(state.document)].slice(-50),
      redoStack: [],
      revision: state.revision + 1,
      dirty: true,
      projectActivity: appendActivity(
        state.projectActivity,
        'SAFE_AUTOFIX_APPLIED',
        `Applied safe autofix for ${diagnostic.code} at ${diagnostic.path}.`,
      ),
    };
  }),
  stageObjectType: (externalId) => set((state) => {
    if (!state.document) return state;
    const subtree = collectSubtreeIds(state.document.schema.objectSchema.objectTypes, externalId);
    if (subtree.size === 0) return state;
    const next = [...new Set([...state.stagedForDeletion, ...subtree])];
    return {
      ...state,
      stagedForDeletion: next,
      dirty: true,
      projectActivity: appendActivity(
        state.projectActivity,
        'OBJECT_TYPE_STAGED',
        `Staged "${externalId}" (+ ${subtree.size - 1} descendant(s)) for deletion.`,
        state.currentUserEmail,
      ),
    };
  }),
  unstageObjectType: (externalId) => set((state) => {
    if (!state.document) return state;
    const subtree = collectSubtreeIds(state.document.schema.objectSchema.objectTypes, externalId);
    const toRemove = subtree.size > 0 ? subtree : new Set([externalId]);
    const next = state.stagedForDeletion.filter((id) => !toRemove.has(id));
    return {
      ...state,
      stagedForDeletion: next,
      dirty: true,
      projectActivity: appendActivity(
        state.projectActivity,
        'OBJECT_TYPE_UNSTAGED',
        `Restored "${externalId}" from staged deletions.`,
        state.currentUserEmail,
      ),
    };
  }),
  clearStagedDeletions: () => set((state) => ({
    ...state,
    stagedForDeletion: [],
    dirty: true,
    projectActivity: appendActivity(
      state.projectActivity,
      'STAGED_DELETIONS_CLEARED',
      'Restored all staged object types.',
      state.currentUserEmail,
    ),
  })),
  commitStagedDeletions: () => set((state) => {
    if (!state.document || state.stagedForDeletion.length === 0) return state;
    const nextDocument = applyStaging(state.document, state.stagedForDeletion);
    const count = state.stagedForDeletion.length;
    return {
      ...state,
      document: nextDocument,
      rawJson: JSON.stringify(nextDocument, null, 2),
      stagedForDeletion: [],
      validationPending: true,
      undoStack: [...state.undoStack, deepCloneDocument(state.document)].slice(-50),
      redoStack: [],
      revision: state.revision + 1,
      dirty: true,
      projectActivity: appendActivity(
        state.projectActivity,
        'STAGED_DELETIONS_COMMITTED',
        `Permanently deleted ${count} staged object type(s).`,
        state.currentUserEmail,
      ),
    };
  }),
}), {
  name: 'jsm-assets-schema-designer-store',
  storage: createJSONStorage(() => safeLocalStorage),
  partialize: (state) => ({
    diskProjectId: state.diskProjectId,
    diskLastSyncedAt: state.diskLastSyncedAt,
    diskProjects: state.diskProjects,
    deferredDiagnostics: state.deferredDiagnostics,
  }),
  onRehydrateStorage: () => (state) => {
    if (state?.diskProjectId) {
      void useDocumentStore.getState().loadDiskProject(state.diskProjectId);
    }
  },
}));

