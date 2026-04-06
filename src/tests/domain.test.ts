import { describe, expect, it } from 'vitest';
import fixture from '@/tests/fixtures/sampleDocument.json';
import { normalizeAssetsImportDocument, parseAssetsImportDocument } from '@/domain/normalizers/normalizeAssetsImportDocument';
import { buildIndexes, flattenObjectTypes } from '@/domain/selectors/indexes';
import { cloneMapping } from '@/domain/transformers/cloneMapping';
import { generateObjectTypeMapping } from '@/domain/transformers/generateObjectTypeMapping';
import { analyzeImpact } from '@/domain/transformers/impactAnalysis';
import { applyDropAndRecreate, canDropAndRecreate } from '@/domain/transformers/quickFix';
import { applySafeAutofix, canApplySafeAutofix } from '@/domain/transformers/safeAutofix';
import { buildSemanticDiff } from '@/domain/transformers/semanticDiff';
import { validateBusinessRules } from '@/domain/validators/validateBusinessRules';
import { validateContract } from '@/domain/validators/validateContract';
import { validateDocument } from '@/domain/validators/validateDocument';
import type { AssetsImportDocument, FlattenedObjectType, ObjectTypeMappingDefinition } from '@/domain/model/types';
import { buildSearchIndex } from '@/domain/selectors/searchIndex';
import { bulkAddAttribute } from '@/domain/transformers/bulkAddAttribute';
import { computeSchemaStats } from '@/domain/selectors/schemaStats';
import { computeMappingCompleteness } from '@/domain/selectors/mappingCompleteness';
import { validateCircularReferences } from '@/domain/validators/validateCircularReferences';
import { cloneObjectType } from '@/domain/transformers/cloneObjectType';
import { buildAttributeUsageReport } from '@/domain/selectors/attributeUsage';
import { buildChangelogNarrative } from '@/domain/transformers/changelogNarrative';
import { exportToMarkdown } from '@/domain/transformers/exportMarkdown';
import { exportToCsv } from '@/domain/transformers/exportCsv';
import { validateInheritanceConflicts } from '@/domain/validators/validateInheritanceConflicts';
import { buildReferenceEdges } from '@/domain/selectors/referenceGraph';
import { moveAttributes } from '@/domain/transformers/moveAttributes';
import type { AssetsImportDocument as Doc } from '@/domain/model/types';

describe('domain layer', () => {
  it('normalizes a valid document', () => {
    const document = normalizeAssetsImportDocument(fixture);
    expect(document.mapping.objectTypeMappings).toHaveLength(1);
  });

  it('flattens nested object types', () => {
    const flattened = flattenObjectTypes(fixture.schema.objectSchema.objectTypes);
    expect(flattened.map((item) => item.objectType.externalId)).toEqual(['cmdb-company', 'cmdb-users']);
  });

  it('reports schema validation diagnostics', () => {
    const result = parseAssetsImportDocument('{"schema":{}}');
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('validates the sample document without errors', () => {
    const diagnostics = validateDocument(fixture);
    expect(diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0);
  });

  it('generates mapping entries with label externalIdPart', () => {
    const flattened: FlattenedObjectType = {
      objectType: {
        externalId: 'cmdb-test',
        name: 'Test Type',
        attributes: [{
          externalId: 'test-name',
          name: 'Name',
          type: 'text',
          label: true,
        }],
      },
      parentExternalId: undefined,
      path: 'cmdb-test',
      jsonPath: '/schema/objectSchema/objectTypes/0',
      depth: 0,
      inheritedAttributes: [],
      effectiveAttributes: [{
        externalId: 'test-name',
        name: 'Name',
        type: 'text',
        label: true,
      }],
      attributeLookup: new Map([
        ['test-name', { attribute: {
          externalId: 'test-name',
          name: 'Name',
          type: 'text',
          label: true,
        }, path: '/schema/objectSchema/objectTypes/0/attributes/0' }],
      ]),
    };

    const mapping = generateObjectTypeMapping(flattened);
    expect(mapping.attributesMapping[0].externalIdPart).toBe(true);
  });

  it('adds objectMappingIQL for referenced_object attributes', () => {
    const flattened: FlattenedObjectType = {
      objectType: {
        externalId: 'cmdb-test',
        name: 'Test Type',
        attributes: [{
          externalId: 'test-ref',
          name: 'Related Service',
          type: 'referenced_object',
        }],
      },
      parentExternalId: undefined,
      path: 'cmdb-test',
      jsonPath: '/schema/objectSchema/objectTypes/0',
      depth: 0,
      inheritedAttributes: [],
      effectiveAttributes: [{
        externalId: 'test-ref',
        name: 'Related Service',
        type: 'referenced_object',
      }],
      attributeLookup: new Map([
        ['test-ref', { attribute: {
          externalId: 'test-ref',
          name: 'Related Service',
          type: 'referenced_object',
        }, path: '/schema/objectSchema/objectTypes/0/attributes/0' }],
      ]),
    };

    const mapping = generateObjectTypeMapping(flattened);
    expect(mapping.attributesMapping[0].objectMappingIQL).toContain('relatedService');
  });

  it('marks unique+required attribute as externalIdPart', () => {
    const flattened: FlattenedObjectType = {
      objectType: { externalId: 'cmdb-test', name: 'Test', attributes: [{ externalId: 'test-uid', name: 'UID', type: 'text', unique: true, minimumCardinality: 1 }] },
      parentExternalId: undefined,
      path: 'cmdb-test',
      jsonPath: '/schema/objectSchema/objectTypes/0',
      depth: 0,
      inheritedAttributes: [],
      effectiveAttributes: [{ externalId: 'test-uid', name: 'UID', type: 'text', unique: true, minimumCardinality: 1 }],
      attributeLookup: new Map(),
    };
    const mapping = generateObjectTypeMapping(flattened);
    expect(mapping.attributesMapping[0].externalIdPart).toBe(true);
  });

  it('generates valueMapping stubs for select attributes with typeValues', () => {
    const flattened: FlattenedObjectType = {
      objectType: {
        externalId: 'cmdb-test', name: 'Test',
        attributes: [{ externalId: 'test-status', name: 'Status', type: 'select', typeValues: ['Active', 'Inactive', 'Pending'] }],
      },
      parentExternalId: undefined,
      path: 'cmdb-test',
      jsonPath: '/schema/objectSchema/objectTypes/0',
      depth: 0,
      inheritedAttributes: [],
      effectiveAttributes: [{ externalId: 'test-status', name: 'Status', type: 'select', typeValues: ['Active', 'Inactive', 'Pending'] }],
      attributeLookup: new Map(),
    };
    const mapping = generateObjectTypeMapping(flattened);
    expect(mapping.attributesMapping[0].valueMapping).toEqual({ Active: 'Active', Inactive: 'Inactive', Pending: 'Pending' });
  });

  it('uses target type label attribute name in IQL when indexes provided', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const indexes = buildIndexes(doc);
    const flattened = flattenObjectTypes(doc.schema.objectSchema.objectTypes);
    const usersType = flattened.find((f) => f.objectType.externalId === 'cmdb-users')!;
    const mapping = generateObjectTypeMapping(usersType, undefined, indexes);
    const companyAttrMapping = mapping.attributesMapping.find((a) => a.attributeExternalId === 'users-company');
    // Company's label attribute is "Name", so IQL should reference "Name"
    expect(companyAttrMapping?.objectMappingIQL).toContain('"Name"');
  });

  it('cloneMapping adapts source structure to target type', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const indexes = buildIndexes(doc);
    const flattened = flattenObjectTypes(doc.schema.objectSchema.objectTypes);
    const companyType = flattened.find((f) => f.objectType.externalId === 'cmdb-company')!;

    const source: ObjectTypeMappingDefinition = {
      objectTypeExternalId: 'cmdb-users',
      objectTypeName: 'Users',
      selector: 'users',
      unknownValues: 'IGNORE',
      attributesMapping: [
        { attributeExternalId: 'users-object-id', attributeName: 'Name', attributeLocators: ['customNameCol'], externalIdPart: true },
      ],
    };

    const cloned = cloneMapping(source, companyType, 'company', indexes);
    expect(cloned.objectTypeExternalId).toBe('cmdb-company');
    expect(cloned.unknownValues).toBe('IGNORE');
    // "Name" matches by name — locator from source should be carried over
    const nameAttr = cloned.attributesMapping.find((a) => a.attributeExternalId === 'company-name');
    expect(nameAttr?.attributeLocators).toEqual(['customNameCol']);
  });

  it('builds semantic diff diagnostics for added and removed entities', () => {
    const previous = JSON.parse(JSON.stringify(fixture));
    const next = JSON.parse(JSON.stringify(fixture));

    next.schema.objectSchema.objectTypes.push({
      externalId: 'cmdb-new-type',
      name: 'New Type',
      attributes: [],
    });

    next.mapping.objectTypeMappings = next.mapping.objectTypeMappings.filter((mapping: { objectTypeExternalId: string }) => (
      mapping.objectTypeExternalId !== fixture.mapping.objectTypeMappings[0].objectTypeExternalId
    ));

    const diagnostics = buildSemanticDiff(previous, next);

    expect(diagnostics.some((item) => item.code === 'SEMANTIC_OBJECT_TYPE_ADDED')).toBe(true);
    expect(diagnostics.some((item) => item.code === 'SEMANTIC_MAPPING_REMOVED')).toBe(true);
  });

  // --- Contract validation ---

  it('flags invalid attribute type', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{ ...doc.schema.objectSchema.objectTypes[0], attributes: [{ externalId: 'x', name: 'X', type: 'nonsense' }] }],
        },
      },
    };
    const result = validateContract(bad);
    expect(result.some((d) => d.code === 'ATTRIBUTE_TYPE_INVALID')).toBe(true);
  });

  it('accepts maximumCardinality -1 as unlimited (no error)', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const unlimited: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{
            ...doc.schema.objectSchema.objectTypes[0],
            attributes: [{ externalId: 'x', name: 'X', type: 'text', minimumCardinality: 0, maximumCardinality: -1 }],
          }],
        },
      },
    };
    const result = validateContract(unlimited);
    expect(result.some((d) => d.code === 'CARDINALITY_RANGE_INVALID')).toBe(false);
    expect(result.some((d) => d.code === 'CARDINALITY_NEGATIVE')).toBe(false);
  });

  it('flags cardinality range invalid (min > max)', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{
            ...doc.schema.objectSchema.objectTypes[0],
            attributes: [{ externalId: 'x', name: 'X', type: 'text', minimumCardinality: 5, maximumCardinality: 2 }],
          }],
        },
      },
    };
    const result = validateContract(bad);
    expect(result.some((d) => d.code === 'CARDINALITY_RANGE_INVALID')).toBe(true);
  });

  it('flags empty selector', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      mapping: {
        objectTypeMappings: [{ ...doc.mapping.objectTypeMappings[0], selector: '' }],
      },
    };
    const result = validateContract(bad);
    expect(result.some((d) => d.code === 'SELECTOR_EMPTY')).toBe(true);
  });

  it('flags duplicate selector', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      mapping: {
        objectTypeMappings: [
          { ...doc.mapping.objectTypeMappings[0], selector: 'same' },
          { ...doc.mapping.objectTypeMappings[0], objectTypeExternalId: 'other-type', selector: 'same' },
        ],
      },
    };
    const result = validateContract(bad);
    expect(result.some((d) => d.code === 'SELECTOR_DUPLICATE')).toBe(true);
  });

  it('flags missing attribute locators', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      mapping: {
        objectTypeMappings: [{
          ...doc.mapping.objectTypeMappings[0],
          attributesMapping: [{ attributeExternalId: 'users-object-id', attributeLocators: [] }],
        }],
      },
    };
    const result = validateContract(bad);
    expect(result.some((d) => d.code === 'ATTRIBUTE_LOCATORS_MISSING')).toBe(true);
  });

  // --- Business rules ---

  it('flags missing label attribute', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const noLabel: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{
            ...doc.schema.objectSchema.objectTypes[0],
            attributes: [{ externalId: 'x', name: 'X', type: 'text', label: false }],
            children: [],
          }],
        },
      },
    };
    const result = validateBusinessRules(noLabel);
    expect(result.some((d) => d.code === 'LABEL_ATTRIBUTE_MISSING')).toBe(true);
  });

  it('flags select attribute with no typeValues', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{
            ...doc.schema.objectSchema.objectTypes[0],
            attributes: [{ externalId: 'x', name: 'X', type: 'select' }],
            children: [],
          }],
        },
      },
    };
    const result = validateBusinessRules(bad);
    expect(result.some((d) => d.code === 'SELECT_TYPE_VALUES_MISSING')).toBe(true);
  });

  it('flags duplicate mapping for same object type', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      mapping: {
        objectTypeMappings: [
          doc.mapping.objectTypeMappings[0],
          { ...doc.mapping.objectTypeMappings[0] },
        ],
      },
    };
    const result = validateBusinessRules(bad);
    expect(result.some((d) => d.code === 'DUPLICATE_MAPPING_OBJECT_TYPE')).toBe(true);
  });

  it('flags incomplete valueMapping for select attribute', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const bad: AssetsImportDocument = {
      ...doc,
      schema: {
        ...doc.schema,
        objectSchema: {
          ...doc.schema.objectSchema,
          objectTypes: [{
            externalId: 'cmdb-company', name: 'Company',
            attributes: [{ externalId: 'company-name', name: 'Name', type: 'text', label: true }],
            children: [{
              externalId: 'cmdb-users', name: 'Users', inheritance: true,
              attributes: [
                { externalId: 'users-object-id', name: 'Object ID', type: 'text', unique: true, minimumCardinality: 1, maximumCardinality: 1 },
                { externalId: 'users-status', name: 'Status', type: 'select', typeValues: ['Active', 'Inactive', 'Pending'] },
              ],
            }],
          }],
        },
      },
      mapping: {
        objectTypeMappings: [{
          objectTypeExternalId: 'cmdb-users',
          objectTypeName: 'Users',
          selector: 'users',
          attributesMapping: [
            { attributeExternalId: 'users-object-id', attributeLocators: ['id'], externalIdPart: true },
            { attributeExternalId: 'users-status', attributeLocators: ['status'], valueMapping: { Active: 'Active' } },
          ],
        }],
      },
    };
    const result = validateBusinessRules(bad);
    const finding = result.find((d) => d.code === 'VALUE_MAPPING_INCOMPLETE');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('Inactive');
  });

  // --- Impact analysis expansion ---

  it('flags any attribute type change as breaking (not just referenced_object)', () => {
    const baseline = normalizeAssetsImportDocument(fixture);
    const current: AssetsImportDocument = {
      ...baseline,
      schema: {
        ...baseline.schema,
        objectSchema: {
          ...baseline.schema.objectSchema,
          objectTypes: baseline.schema.objectSchema.objectTypes.map((ot) => ({
            ...ot,
            attributes: (ot.attributes ?? []).map((attr) =>
              attr.externalId === 'company-name' ? { ...attr, type: 'textarea' } : attr,
            ),
          })),
        },
      },
    };
    const diagnostics = analyzeImpact(baseline, current);
    expect(diagnostics.some((d) => d.code === 'BREAKING_ATTRIBUTE_TYPE_CHANGED')).toBe(true);
    const finding = diagnostics.find((d) => d.code === 'BREAKING_ATTRIBUTE_TYPE_CHANGED');
    expect(finding?.metadata?.previousType).toBe('text');
    expect(finding?.metadata?.newType).toBe('textarea');
  });

  it('flags selector change as breaking', () => {
    const baseline = normalizeAssetsImportDocument(fixture);
    const current: AssetsImportDocument = {
      ...baseline,
      mapping: {
        objectTypeMappings: baseline.mapping.objectTypeMappings.map((m) => ({ ...m, selector: 'new-selector' })),
      },
    };
    const diagnostics = analyzeImpact(baseline, current);
    expect(diagnostics.some((d) => d.code === 'BREAKING_SELECTOR_CHANGED')).toBe(true);
  });

  it('flags externalIdPart removal as breaking', () => {
    const baseline = normalizeAssetsImportDocument(fixture);
    const current: AssetsImportDocument = {
      ...baseline,
      mapping: {
        objectTypeMappings: baseline.mapping.objectTypeMappings.map((m) => ({
          ...m,
          attributesMapping: m.attributesMapping.map((a) => ({ ...a, externalIdPart: false })),
        })),
      },
    };
    const diagnostics = analyzeImpact(baseline, current);
    expect(diagnostics.some((d) => d.code === 'BREAKING_EXTERNAL_ID_PART_REMOVED')).toBe(true);
  });

  // --- Drop & recreate quick fix ---

  it('canDropAndRecreate returns true for BREAKING_ATTRIBUTE_TYPE_CHANGED with full metadata', () => {
    expect(canDropAndRecreate({
      code: 'BREAKING_ATTRIBUTE_TYPE_CHANGED',
      severity: 'error',
      message: '',
      path: '',
      metadata: { objectTypeExternalId: 'cmdb-company', attributeExternalId: 'company-name', previousType: 'text' },
    })).toBe(true);
  });

  it('applyDropAndRecreate reverts old attribute type and adds stub', () => {
    const baseline = normalizeAssetsImportDocument(fixture);
    // Simulate: company-name was changed from text to textarea
    const current: AssetsImportDocument = {
      ...baseline,
      schema: {
        ...baseline.schema,
        objectSchema: {
          ...baseline.schema.objectSchema,
          objectTypes: baseline.schema.objectSchema.objectTypes.map((ot) => ({
            ...ot,
            attributes: (ot.attributes ?? []).map((attr) =>
              attr.externalId === 'company-name' ? { ...attr, type: 'textarea' } : attr,
            ),
          })),
        },
      },
    };
    const diagnostic = {
      code: 'BREAKING_ATTRIBUTE_TYPE_CHANGED',
      severity: 'error' as const,
      message: '',
      path: '',
      metadata: { objectTypeExternalId: 'cmdb-company', attributeExternalId: 'company-name', previousType: 'text', newType: 'textarea' },
    };
    const fixed = applyDropAndRecreate(current, diagnostic);
    const companyType = fixed.schema.objectSchema.objectTypes.find((ot) => ot.externalId === 'cmdb-company');
    const original = companyType?.attributes?.find((a) => a.externalId === 'company-name');
    const stub = companyType?.attributes?.find((a) => a.externalId === '' && a.type === 'textarea');
    // Original attribute type should be reverted to text
    expect(original?.type).toBe('text');
    // Stub should be added with the intended type and empty externalId
    expect(stub).toBeDefined();
    expect(stub?.name).toBe('Name');
  });

  it('applies safe autofix for removed mapping finding', () => {
    const baseline = JSON.parse(JSON.stringify(fixture));
    const current = JSON.parse(JSON.stringify(fixture));
    current.mapping.objectTypeMappings = [];

    const finding = {
      code: 'SEMANTIC_MAPPING_REMOVED',
      severity: 'warning',
      message: `Mapping for ${fixture.mapping.objectTypeMappings[0].objectTypeExternalId} was removed.`,
      path: '/mapping/objectTypeMappings/0',
      metadata: { objectTypeExternalId: fixture.mapping.objectTypeMappings[0].objectTypeExternalId },
    } as const;

    expect(canApplySafeAutofix(finding)).toBe(true);
    const fixed = applySafeAutofix(current, baseline, finding);
    expect(fixed.mapping.objectTypeMappings.length).toBe(1);
    expect(fixed.mapping.objectTypeMappings[0].objectTypeExternalId).toBe(fixture.mapping.objectTypeMappings[0].objectTypeExternalId);
  });

  // --- buildSearchIndex ---

  it('buildSearchIndex returns results for object types and attributes', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const results = buildSearchIndex(doc);

    const objectTypeResults = results.filter((r) => r.kind === 'objectType');
    const attributeResults = results.filter((r) => r.kind === 'attribute');

    expect(objectTypeResults.length).toBe(2); // cmdb-company and cmdb-users
    expect(objectTypeResults.some((r) => r.externalId === 'cmdb-company')).toBe(true);
    expect(objectTypeResults.some((r) => r.externalId === 'cmdb-users')).toBe(true);

    // cmdb-company has 1 local attribute, cmdb-users has 2 local attributes
    expect(attributeResults.length).toBe(3);
    const companyNameResult = attributeResults.find((r) => r.externalId === 'company-name');
    expect(companyNameResult).toBeDefined();
    if (companyNameResult?.kind === 'attribute') {
      expect(companyNameResult.objectTypeExternalId).toBe('cmdb-company');
      expect(companyNameResult.jsonPath).toBe('/schema/objectSchema/objectTypes/0/attributes/0');
    }
  });

  // --- bulkAddAttribute ---

  it('bulkAddAttribute adds to multiple types and skips duplicates', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const newAttr = { externalId: 'shared-tag', name: 'Tag', type: 'text' as const };

    const result = bulkAddAttribute(doc, ['cmdb-company', 'cmdb-users'], newAttr);
    expect(result.skippedExternalIds).toHaveLength(0);

    const flat = flattenObjectTypes(result.document.schema.objectSchema.objectTypes);
    const company = flat.find((f) => f.objectType.externalId === 'cmdb-company');
    const users = flat.find((f) => f.objectType.externalId === 'cmdb-users');

    expect(company?.objectType.attributes?.some((a) => a.externalId === 'shared-tag')).toBe(true);
    expect(users?.objectType.attributes?.some((a) => a.externalId === 'shared-tag')).toBe(true);

    // Adding again should skip both
    const result2 = bulkAddAttribute(result.document, ['cmdb-company', 'cmdb-users'], newAttr);
    expect(result2.skippedExternalIds).toContain('cmdb-company');
    expect(result2.skippedExternalIds).toContain('cmdb-users');
  });

  // --- computeSchemaStats ---

  it('computeSchemaStats returns correct counts', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const stats = computeSchemaStats(doc);

    expect(stats.objectTypeCount).toBe(2);
    // cmdb-company: 1 local attr, cmdb-users: 2 local attrs
    expect(stats.totalAttributeCount).toBe(3);
    expect(stats.typesWithNoAttributes).toBe(0);
    // Only cmdb-users is mapped
    expect(stats.mappedObjectTypeCount).toBe(1);
    expect(stats.unmappedObjectTypeCount).toBe(1);
    expect(stats.mappingCoveragePercent).toBe(50);
    // cmdb-company at depth 0, cmdb-users at depth 1
    expect(stats.inheritanceDepthDistribution[0]).toBe(1);
    expect(stats.inheritanceDepthDistribution[1]).toBe(1);
  });

  // --- computeMappingCompleteness ---

  it('computeMappingCompleteness correctly marks mapped vs unmapped', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const completeness = computeMappingCompleteness(doc);

    const companyCompleteness = completeness.find((c) => c.objectTypeExternalId === 'cmdb-company');
    const usersCompleteness = completeness.find((c) => c.objectTypeExternalId === 'cmdb-users');

    expect(companyCompleteness?.hasMapping).toBe(false);
    expect(usersCompleteness?.hasMapping).toBe(true);

    // cmdb-users has mapping with 2 attributes that both have locators
    // effectiveAttributes includes inherited company-name + local users-object-id + users-company = 3
    expect(usersCompleteness?.totalAttributes).toBe(3);
    expect(usersCompleteness?.mappedAttributes).toBe(2);
    expect(usersCompleteness?.unmappedAttributes).toBe(1); // company-name not in users mapping
  });

  // --- validateCircularReferences ---

  it('validateCircularReferences detects a cycle', () => {
    const doc: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'type-a',
              name: 'Type A',
              attributes: [{
                externalId: 'attr-a-ref',
                name: 'Ref to B',
                type: 'referenced_object',
                referenceObjectTypeExternalId: 'type-b',
              }],
            },
            {
              externalId: 'type-b',
              name: 'Type B',
              attributes: [{
                externalId: 'attr-b-ref',
                name: 'Ref to A',
                type: 'referenced_object',
                referenceObjectTypeExternalId: 'type-a',
              }],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };
    const diagnostics = validateCircularReferences(doc);
    expect(diagnostics.some((d) => d.code === 'CIRCULAR_REFERENCE_DETECTED')).toBe(true);
  });

  it('validateCircularReferences does NOT flag a valid acyclic graph', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    // fixture has cmdb-users -> cmdb-company but not back, so no cycle
    const diagnostics = validateCircularReferences(doc);
    expect(diagnostics.filter((d) => d.code === 'CIRCULAR_REFERENCE_DETECTED')).toHaveLength(0);
  });

  // --- cloneObjectType ---

  it('cloneObjectType clones without children and deduplicates attribute externalIds', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const cloned = cloneObjectType(doc, 'cmdb-company', 'cmdb-company-2', 'Company Copy');

    const flat = flattenObjectTypes(cloned.schema.objectSchema.objectTypes);
    const originalCompany = flat.find((f) => f.objectType.externalId === 'cmdb-company');
    const clonedCompany = flat.find((f) => f.objectType.externalId === 'cmdb-company-2');

    expect(clonedCompany).toBeDefined();
    expect(clonedCompany?.objectType.name).toBe('Company Copy');
    // Children should NOT be cloned
    expect(clonedCompany?.objectType.children).toBeUndefined();
    // Original's children should be untouched
    expect(originalCompany?.objectType.children?.length).toBe(1);

    // Attribute externalIds should be remapped (no collision with originals)
    const clonedAttr = clonedCompany?.objectType.attributes?.[0];
    expect(clonedAttr?.externalId).toBe('company-name_copy');
    expect(clonedAttr?.name).toBe('Name'); // name unchanged
  });

  it('cloneObjectType inserts clone as adjacent sibling', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const cloned = cloneObjectType(doc, 'cmdb-company', 'cmdb-company-clone', 'Company Clone');
    // Root-level types: [cmdb-company, cmdb-company-clone]
    const rootTypes = cloned.schema.objectSchema.objectTypes;
    expect(rootTypes[0].externalId).toBe('cmdb-company');
    expect(rootTypes[1].externalId).toBe('cmdb-company-clone');
  });

  // --- buildAttributeUsageReport ---

  it('buildAttributeUsageReport finds usages across types and mappings', () => {
    const doc = normalizeAssetsImportDocument(fixture);

    // company-name is local on cmdb-company and inherited by cmdb-users
    const companyNameReport = buildAttributeUsageReport(doc, 'company-name');
    expect(companyNameReport.objectTypes.some((ot) => ot.externalId === 'cmdb-company' && !ot.isInherited)).toBe(true);
    expect(companyNameReport.objectTypes.some((ot) => ot.externalId === 'cmdb-users' && ot.isInherited)).toBe(true);
    // company-name is not in the mapping attributesMapping
    expect(companyNameReport.mappings).toHaveLength(0);

    // users-object-id is mapped with locators
    const usersIdReport = buildAttributeUsageReport(doc, 'users-object-id');
    expect(usersIdReport.objectTypes.some((ot) => ot.externalId === 'cmdb-users')).toBe(true);
    expect(usersIdReport.mappings).toHaveLength(1);
    expect(usersIdReport.mappings[0].externalIdPart).toBe(true);
    expect(usersIdReport.mappings[0].attributeLocators).toContain('userId');
  });

  // --- buildChangelogNarrative ---

  it('buildChangelogNarrative detects adds, removes, renames, and type changes', () => {
    const previous: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'type-alpha',
              name: 'Alpha',
              attributes: [
                { externalId: 'alpha-1', name: 'Field One', type: 'text' },
                { externalId: 'alpha-2', name: 'Old Name', type: 'integer' },
                { externalId: 'alpha-3', name: 'Will Change Type', type: 'text' },
              ],
            },
            {
              externalId: 'type-beta',
              name: 'Beta',
              attributes: [],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };

    const next: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'type-alpha',
              name: 'Alpha',
              attributes: [
                { externalId: 'alpha-1', name: 'Field One', type: 'text' },
                { externalId: 'alpha-new', name: 'New Name', type: 'integer' }, // same index as alpha-2 -> rename
                { externalId: 'alpha-3', name: 'Will Change Type', type: 'textarea' }, // type changed
              ],
            },
            // type-beta removed
            {
              externalId: 'type-gamma',
              name: 'Gamma',
              attributes: [],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };

    const changelog = buildChangelogNarrative(previous, next);

    expect(changelog.addedObjectTypes).toContain('type-gamma');
    expect(changelog.removedObjectTypes).toContain('type-beta');

    const alphaEntry = changelog.entries.find((e) => e.objectTypeExternalId === 'type-alpha');
    expect(alphaEntry).toBeDefined();
    expect(alphaEntry?.changes.some((c) => c.includes('Renamed') && c.includes('Old Name') && c.includes('New Name'))).toBe(true);
    expect(alphaEntry?.changes.some((c) => c.includes('Changed type') && c.includes('text') && c.includes('textarea'))).toBe(true);

    expect(changelog.summary).toContain('1 type');
    expect(changelog.summary).toContain('added');
  });

  // --- exportToMarkdown ---

  it('exportToMarkdown contains object type names and attribute names', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const md = exportToMarkdown(doc);

    expect(md).toContain('# Schema: Demo Schema');
    expect(md).toContain('Company');
    expect(md).toContain('Users');
    expect(md).toContain('company-name');
    expect(md).toContain('users-object-id');
    expect(md).toContain('users-company');
  });

  it('exportToMarkdown marks inherited attributes', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const md = exportToMarkdown(doc);

    // company-name is inherited by cmdb-users (inheritance: true)
    // The Users section should contain "Name *(inherited)*"
    const usersSectionStart = md.indexOf('## Users');
    expect(usersSectionStart).toBeGreaterThan(-1);
    const usersSection = md.slice(usersSectionStart);
    expect(usersSection).toContain('*(inherited)*');
    // The Company section should NOT mark Name as inherited
    const companySectionStart = md.indexOf('## Company');
    const companySectionEnd = md.indexOf('## Users');
    const companySection = md.slice(companySectionStart, companySectionEnd);
    expect(companySection).not.toContain('*(inherited)*');
  });

  // --- exportToCsv ---

  it('exportToCsv produces correct header row', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const csv = exportToCsv(doc);
    const [headerRow] = csv.split('\n');
    expect(headerRow).toBe(
      'objectTypeName,objectTypeExternalId,attributeName,attributeExternalId,type,minimumCardinality,maximumCardinality,label,unique,inherited',
    );
  });

  it('exportToCsv produces data rows for all effective attributes', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const csv = exportToCsv(doc);
    const rows = csv.split('\n');

    // Header + 1 row for Company (1 attr) + 3 rows for Users (3 effective: inherited company-name + 2 local)
    expect(rows).toHaveLength(1 + 1 + 3);

    // Company row
    expect(rows.some((r) => r.includes('"company-name"') && r.includes('"Company"'))).toBe(true);
    // Users local attributes
    expect(rows.some((r) => r.includes('"users-object-id"') && r.includes('"Users"'))).toBe(true);
  });

  it('exportToCsv correctly marks inherited column', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const csv = exportToCsv(doc);
    const rows = csv.split('\n').slice(1); // skip header

    // company-name row under Company should be inherited=false
    const companyNameInCompany = rows.find(
      (r) => r.includes('"company-name"') && r.includes('"Company","cmdb-company"'),
    );
    expect(companyNameInCompany).toBeDefined();
    expect(companyNameInCompany).toContain('"false"');

    // company-name row under Users should be inherited=true
    const companyNameInUsers = rows.find(
      (r) => r.includes('"company-name"') && r.includes('"Users","cmdb-users"'),
    );
    expect(companyNameInUsers).toBeDefined();
    expect(companyNameInUsers).toContain('"true"');

    // users-object-id under Users should be inherited=false
    const usersObjectId = rows.find(
      (r) => r.includes('"users-object-id"') && r.includes('"Users","cmdb-users"'),
    );
    expect(usersObjectId).toBeDefined();
    expect(usersObjectId).toContain('"false"');
  });

  // --- validateInheritanceConflicts ---

  it('validateInheritanceConflicts emits INHERITED_ATTRIBUTE_TYPE_CONFLICT when child redefines inherited attribute with different type', () => {
    const doc: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'parent-type',
              name: 'Parent',
              attributes: [
                { externalId: 'shared-attr', name: 'Shared Field', type: 'text' },
              ],
              children: [
                {
                  externalId: 'child-type',
                  name: 'Child',
                  inheritance: true,
                  attributes: [
                    // Same externalId, different type — this is the conflict.
                    { externalId: 'shared-attr', name: 'Shared Field', type: 'integer' },
                  ],
                },
              ],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };

    const diagnostics = validateInheritanceConflicts(doc);
    expect(diagnostics.some((d) => d.code === 'INHERITED_ATTRIBUTE_TYPE_CONFLICT')).toBe(true);
    const conflict = diagnostics.find((d) => d.code === 'INHERITED_ATTRIBUTE_TYPE_CONFLICT');
    expect(conflict?.metadata?.objectTypeExternalId).toBe('child-type');
    expect(conflict?.metadata?.attributeExternalId).toBe('shared-attr');
    expect(conflict?.message).toContain('integer');
    expect(conflict?.message).toContain('text');
  });

  it('validateInheritanceConflicts does NOT emit a diagnostic when child overrides with the same type', () => {
    const doc: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'parent-type',
              name: 'Parent',
              attributes: [
                { externalId: 'shared-attr', name: 'Shared Field', type: 'text' },
              ],
              children: [
                {
                  externalId: 'child-type',
                  name: 'Child',
                  inheritance: true,
                  attributes: [
                    // Same externalId, same type — allowed.
                    { externalId: 'shared-attr', name: 'Shared Field Overridden', type: 'text' },
                  ],
                },
              ],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };

    const diagnostics = validateInheritanceConflicts(doc);
    expect(diagnostics.filter((d) => d.code === 'INHERITED_ATTRIBUTE_TYPE_CONFLICT')).toHaveLength(0);
  });

  it('validateInheritanceConflicts does NOT emit a diagnostic for types with no inheritance', () => {
    const doc: AssetsImportDocument = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'standalone-type',
              name: 'Standalone',
              attributes: [
                { externalId: 'attr-a', name: 'Attr A', type: 'text' },
              ],
            },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };

    const diagnostics = validateInheritanceConflicts(doc);
    expect(diagnostics.filter((d) => d.code === 'INHERITED_ATTRIBUTE_TYPE_CONFLICT')).toHaveLength(0);
  });

  // --- buildReferenceEdges ---

  it('buildReferenceEdges returns edges for referenced_object attributes pointing to existing types', () => {
    const doc = normalizeAssetsImportDocument(fixture);
    const flattened = flattenObjectTypes(doc.schema.objectSchema.objectTypes);
    const edges = buildReferenceEdges(flattened);

    // cmdb-users has a users-company attribute referencing cmdb-company
    expect(edges.some((e) => e.sourceExternalId === 'cmdb-users' && e.targetExternalId === 'cmdb-company')).toBe(true);
    const edge = edges.find((e) => e.sourceExternalId === 'cmdb-users' && e.targetExternalId === 'cmdb-company');
    expect(edge?.attributeExternalId).toBe('users-company');
  });

  it('buildReferenceEdges skips edges where the target does not exist in the flattened list', () => {
    const flattened = flattenObjectTypes([
      {
        externalId: 'type-x',
        name: 'Type X',
        attributes: [
          {
            externalId: 'attr-ref',
            name: 'Ref',
            type: 'referenced_object',
            referenceObjectTypeExternalId: 'nonexistent-type',
          },
        ],
      },
    ]);

    const edges = buildReferenceEdges(flattened);
    expect(edges).toHaveLength(0);
  });

  it('buildReferenceEdges returns multiple edges when multiple attributes reference distinct targets', () => {
    const flattened = flattenObjectTypes([
      {
        externalId: 'type-source',
        name: 'Source',
        attributes: [
          { externalId: 'ref-1', name: 'Ref One', type: 'referenced_object', referenceObjectTypeExternalId: 'type-a' },
          { externalId: 'ref-2', name: 'Ref Two', type: 'referenced_object', referenceObjectTypeExternalId: 'type-b' },
        ],
      },
      { externalId: 'type-a', name: 'Type A', attributes: [] },
      { externalId: 'type-b', name: 'Type B', attributes: [] },
    ]);

    const edges = buildReferenceEdges(flattened);
    expect(edges).toHaveLength(2);
    expect(edges.some((e) => e.targetExternalId === 'type-a' && e.attributeExternalId === 'ref-1')).toBe(true);
    expect(edges.some((e) => e.targetExternalId === 'type-b' && e.attributeExternalId === 'ref-2')).toBe(true);
  });

  // ── moveAttributes ─────────────────────────────────────────────────────────

  const makeDoc = (): Doc => ({
    schema: {
      objectSchema: {
        objectTypes: [
          {
            externalId: 'src',
            name: 'Source',
            attributes: [
              { externalId: 'attr-a', name: 'A', type: 'text' },
              { externalId: 'attr-b', name: 'B', type: 'integer' },
              { externalId: 'attr-c', name: 'C', type: 'boolean' },
            ],
          },
          {
            externalId: 'dst',
            name: 'Destination',
            attributes: [
              { externalId: 'attr-d', name: 'D', type: 'text' },
            ],
          },
        ],
      },
    },
    mapping: {
      objectTypeMappings: [
        {
          objectTypeExternalId: 'src',
          selector: 'type=Source',
          attributesMapping: [
            { attributeExternalId: 'attr-a', attributeLocators: ['col_a'] },
            { attributeExternalId: 'attr-b', attributeLocators: ['col_b'] },
            { attributeExternalId: 'attr-c', attributeLocators: ['col_c'] },
          ],
        },
        {
          objectTypeExternalId: 'dst',
          selector: 'type=Destination',
          attributesMapping: [
            { attributeExternalId: 'attr-d', attributeLocators: ['col_d'] },
          ],
        },
      ],
    },
  });

  it('moveAttributes — moves attributes from source to destination', () => {
    const doc = makeDoc();
    const result = moveAttributes(doc, 'src', ['attr-a', 'attr-b'], 'dst');

    // source loses the moved attrs
    const src = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'src')!;
    expect(src.attributes?.map((a) => a.externalId)).toEqual(['attr-c']);

    // destination gains them
    const dst = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'dst')!;
    expect(dst.attributes?.map((a) => a.externalId)).toEqual(['attr-d', 'attr-a', 'attr-b']);

    expect(result.movedCount).toBe(2);
    expect(result.skippedDuplicates).toHaveLength(0);
  });

  it('moveAttributes — updates mappings on both source and destination', () => {
    const doc = makeDoc();
    const result = moveAttributes(doc, 'src', ['attr-a', 'attr-b'], 'dst');

    const srcMapping = result.document.mapping.objectTypeMappings.find((m) => m.objectTypeExternalId === 'src')!;
    expect(srcMapping.attributesMapping.map((m) => m.attributeExternalId)).toEqual(['attr-c']);

    const dstMapping = result.document.mapping.objectTypeMappings.find((m) => m.objectTypeExternalId === 'dst')!;
    expect(dstMapping.attributesMapping.map((m) => m.attributeExternalId)).toEqual(['attr-d', 'attr-a', 'attr-b']);

    expect(result.mappingSourceRemoved).toBe(2);
    expect(result.mappingDestAdded).toBe(2);
  });

  it('moveAttributes — skips attributes that already exist on destination', () => {
    const base = makeDoc();
    // Seed attr-a onto dst as well so it's a duplicate
    const doc: Doc = {
      ...base,
      schema: {
        ...base.schema,
        objectSchema: {
          ...base.schema.objectSchema,
          objectTypes: base.schema.objectSchema.objectTypes.map((t) =>
            t.externalId === 'dst'
              ? { ...t, attributes: [...(t.attributes ?? []), { externalId: 'attr-a', name: 'A', type: 'text' }] }
              : t,
          ),
        },
      },
    };
    const result = moveAttributes(doc, 'src', ['attr-a', 'attr-b'], 'dst');

    // attr-a skipped (duplicate), attr-b moves
    expect(result.skippedDuplicates).toContain('attr-a');
    expect(result.movedCount).toBe(1);
    const dst = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'dst')!;
    expect(dst.attributes?.some((a) => a.externalId === 'attr-b')).toBe(true);
  });

  it('moveAttributes — renames externalId when source prefix matches', () => {
    const doc: Doc = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'infrastructure-services',
              name: 'Infrastructure Services',
              attributes: [
                { externalId: 'infrastructure-services-ip-address', name: 'IP Address', type: 'ipaddress' },
                { externalId: 'infrastructure-services-name', name: 'Name', type: 'text' },
                { externalId: 'unrelated-attr', name: 'Unrelated', type: 'text' },
              ],
            },
            { externalId: 'network', name: 'Network', attributes: [] },
          ],
        },
      },
      mapping: {
        objectTypeMappings: [
          {
            objectTypeExternalId: 'infrastructure-services',
            selector: 'type=IS',
            attributesMapping: [
              { attributeExternalId: 'infrastructure-services-ip-address', attributeLocators: ['ip'] },
              { attributeExternalId: 'infrastructure-services-name', attributeLocators: ['name'] },
            ],
          },
          { objectTypeExternalId: 'network', selector: 'type=Net', attributesMapping: [] },
        ],
      },
    };

    const result = moveAttributes(
      doc,
      'infrastructure-services',
      ['infrastructure-services-ip-address', 'infrastructure-services-name', 'unrelated-attr'],
      'network',
    );

    const dst = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'network')!;
    const dstIds = dst.attributes?.map((a) => a.externalId);
    expect(dstIds).toContain('network-ip-address');
    expect(dstIds).toContain('network-name');
    // no prefix match — stays unchanged
    expect(dstIds).toContain('unrelated-attr');

    expect(result.renames['infrastructure-services-ip-address']).toBe('network-ip-address');
    expect(result.renames['infrastructure-services-name']).toBe('network-name');
    expect(result.renames['unrelated-attr']).toBeUndefined();

    // mapping attributeExternalIds also renamed
    const dstMapping = result.document.mapping.objectTypeMappings.find((m) => m.objectTypeExternalId === 'network')!;
    expect(dstMapping.attributesMapping.map((m) => m.attributeExternalId)).toContain('network-ip-address');
    expect(dstMapping.attributesMapping.map((m) => m.attributeExternalId)).toContain('network-name');
  });

  it('moveAttributes — renames when source type has schema prefix attrs omit (cmdb- pattern)', () => {
    const doc: Doc = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'cmdb-technical-services',
              name: 'Technical Services',
              attributes: [
                { externalId: 'technical-services-cname', name: 'CName', type: 'text' },
              ],
            },
            { externalId: 'cmdb-switch', name: 'Switch', attributes: [] },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };
    const result = moveAttributes(doc, 'cmdb-technical-services', ['technical-services-cname'], 'cmdb-switch');
    expect(result.renames['technical-services-cname']).toBe('switch-cname');
    const dst = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'cmdb-switch')!;
    expect(dst.attributes?.some((a) => a.externalId === 'switch-cname')).toBe(true);
  });

  it('moveAttributes — no-op when source and destination are the same', () => {
    const doc = makeDoc();
    const result = moveAttributes(doc, 'src', ['attr-a'], 'src');
    expect(result.movedCount).toBe(0);
    expect(result.document).toBe(doc); // exact same reference
  });

  it('moveAttributes — no-op when attribute list is empty', () => {
    const doc = makeDoc();
    const result = moveAttributes(doc, 'src', [], 'dst');
    expect(result.movedCount).toBe(0);
    expect(result.document).toBe(doc);
  });

  it('moveAttributes — works when destination has no mapping (no crash)', () => {
    const doc: Doc = {
      ...makeDoc(),
      mapping: {
        objectTypeMappings: [
          {
            objectTypeExternalId: 'src',
            selector: 'type=Source',
            attributesMapping: [
              { attributeExternalId: 'attr-a', attributeLocators: ['col_a'] },
            ],
          },
          // no mapping for 'dst'
        ],
      },
    };
    const result = moveAttributes(doc, 'src', ['attr-a'], 'dst');
    const srcMapping = result.document.mapping.objectTypeMappings.find((m) => m.objectTypeExternalId === 'src')!;
    expect(srcMapping.attributesMapping).toHaveLength(0);
    expect(result.mappingDestAdded).toBe(0);
    expect(result.movedCount).toBe(1);
  });

  it('moveAttributes — works on nested object types (children)', () => {
    const doc: Doc = {
      schema: {
        objectSchema: {
          objectTypes: [
            {
              externalId: 'parent',
              name: 'Parent',
              children: [
                {
                  externalId: 'child-src',
                  name: 'Child Source',
                  attributes: [{ externalId: 'nested-attr', name: 'N', type: 'text' }],
                },
              ],
            },
            { externalId: 'flat-dst', name: 'Flat Dest', attributes: [] },
          ],
        },
      },
      mapping: { objectTypeMappings: [] },
    };
    const result = moveAttributes(doc, 'child-src', ['nested-attr'], 'flat-dst');
    const childSrc = result.document.schema.objectSchema.objectTypes[0].children?.find(
      (c) => c.externalId === 'child-src',
    )!;
    expect(childSrc.attributes).toHaveLength(0);
    const flatDst = result.document.schema.objectSchema.objectTypes.find((t) => t.externalId === 'flat-dst')!;
    expect(flatDst.attributes?.some((a) => a.externalId === 'nested-attr')).toBe(true);
    expect(result.movedCount).toBe(1);
  });
});
