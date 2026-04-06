import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '@/tests/fixtures/sampleDocument.json';
import { flattenObjectTypes } from '@/domain/selectors/indexes';
import { generateObjectTypeMapping } from '@/domain/transformers/generateObjectTypeMapping';
import { useDocumentStore } from '@/stores/documentStore';

describe('document store', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      rawJson: '',
      document: undefined,
      diagnostics: [],
      projectVersions: [],
      projectActivity: [],
      revision: 0,
      dirty: false,
    });
  });

  it('updates document and raw JSON when adding mappings', () => {
    const { loadDocument, updateDocument } = useDocumentStore.getState();
    loadDocument(JSON.stringify(fixture));

    const initial = useDocumentStore.getState().document;
    expect(initial).toBeDefined();

    const flattened = flattenObjectTypes(fixture.schema.objectSchema.objectTypes);
    const mapping = generateObjectTypeMapping(flattened[0]);

    updateDocument((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        objectTypeMappings: [...current.mapping.objectTypeMappings, mapping],
      },
    }));

    const next = useDocumentStore.getState().document;
    expect(next?.mapping.objectTypeMappings.length).toBe(
      (initial?.mapping.objectTypeMappings.length ?? 0) + 1,
    );
    expect(useDocumentStore.getState().rawJson.length).toBeGreaterThan(0);
  });

  it('creates blank project and saves/restores versions', () => {
    const { loadDocument, updateDocument, saveProjectVersion, restoreProjectVersion } = useDocumentStore.getState();

    // Set up project state directly (createProjectFromScratch is now async/disk — unit test sets state directly)
    useDocumentStore.setState({ projectName: 'Test Project', projectVersions: [] });
    loadDocument(JSON.stringify(fixture), { markDirty: false });
    expect(useDocumentStore.getState().projectName).toBe('Test Project');

    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          name: 'Edited Schema',
        },
      },
    }));

    saveProjectVersion('v1');
    const version = useDocumentStore.getState().projectVersions[0];
    expect(version?.name).toBe('v1');
    if (!version) {
      throw new Error('Expected saved version to exist');
    }

    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          name: 'Edited Again',
        },
      },
    }));

    restoreProjectVersion(version.id);
    expect(useDocumentStore.getState().document?.schema.objectSchema.name).toBe('Edited Schema');
  });

  it('supports undo and redo document history', () => {
    const { loadDocument, updateDocument, undoDocument, redoDocument } = useDocumentStore.getState();
    loadDocument(JSON.stringify(fixture));

    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          name: 'After Edit',
        },
      },
    }));

    expect(useDocumentStore.getState().document?.schema.objectSchema.name).toBe('After Edit');

    undoDocument();
    expect(useDocumentStore.getState().document?.schema.objectSchema.name).toBe(fixture.schema.objectSchema.name);

    redoDocument();
    expect(useDocumentStore.getState().document?.schema.objectSchema.name).toBe('After Edit');
  });

  it('propagates object type and attribute renames into mappings', () => {
    const { loadDocument, updateDocument } = useDocumentStore.getState();
    loadDocument(JSON.stringify(fixture));

    const loaded = useDocumentStore.getState().document;
    if (!loaded) {
      throw new Error('Expected loaded document');
    }

    const loadedFlattened = flattenObjectTypes(loaded.schema.objectSchema.objectTypes);
    const firstType = loadedFlattened[0];
    if (!firstType) {
      throw new Error('Expected at least one object type');
    }

    if (!loaded.mapping.objectTypeMappings.some((mapping) => mapping.objectTypeExternalId === firstType.objectType.externalId)) {
      const generated = generateObjectTypeMapping(firstType);
      updateDocument((current) => ({
        ...current,
        mapping: {
          ...current.mapping,
          objectTypeMappings: [...current.mapping.objectTypeMappings, generated],
        },
      }));
    }

    const sourceDocument = useDocumentStore.getState().document;
    if (!sourceDocument) {
      throw new Error('Expected loaded document');
    }

    const sourceType = sourceDocument.schema.objectSchema.objectTypes[0];
    const sourceMapping = sourceDocument.mapping.objectTypeMappings.find((mapping) => (
      mapping.objectTypeExternalId === sourceType.externalId
    ));
    if (!sourceMapping) {
      throw new Error('Expected mapping for first object type');
    }

    const sourceAttribute = sourceType.attributes?.[0];
    if (!sourceAttribute) {
      throw new Error('Expected first attribute');
    }

    const renamedTypeExternalId = `${sourceType.externalId}_renamed`;
    const renamedTypeName = `${sourceType.name} Renamed`;
    const renamedAttributeExternalId = `${sourceAttribute.externalId}_renamed`;
    const renamedAttributeName = `${sourceAttribute.name} Renamed`;

    updateDocument((current) => ({
      ...current,
      schema: {
        ...current.schema,
        objectSchema: {
          ...current.schema.objectSchema,
          objectTypes: current.schema.objectSchema.objectTypes.map((objectType, index) => {
            if (index !== 0) {
              return objectType;
            }

            return {
              ...objectType,
              externalId: renamedTypeExternalId,
              name: renamedTypeName,
              attributes: (objectType.attributes ?? []).map((attribute, attributeIndex) => {
                if (attributeIndex !== 0) {
                  return attribute;
                }

                return {
                  ...attribute,
                  externalId: renamedAttributeExternalId,
                  name: renamedAttributeName,
                };
              }),
            };
          }),
        },
      },
    }));

    const nextDocument = useDocumentStore.getState().document;
    const nextMapping = nextDocument?.mapping.objectTypeMappings.find((mapping) => (
      mapping.objectTypeExternalId === renamedTypeExternalId
    ));

    expect(nextMapping).toBeDefined();
    expect(nextMapping?.objectTypeName).toBe(renamedTypeName);
    const renamedAttributeMapping = nextMapping?.attributesMapping.find((attributeMapping) => (
      attributeMapping.attributeExternalId === renamedAttributeExternalId
    ));
    expect(renamedAttributeMapping).toBeDefined();
    expect(renamedAttributeMapping?.attributeName).toBe(renamedAttributeName);
  });
});
