import type { AssetsImportDocument, AttributeType, Diagnostic } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

const VALID_ATTRIBUTE_TYPES: ReadonlySet<string> = new Set([
  'text', 'textarea', 'integer', 'double', 'boolean',
  'date', 'time', 'date_time', 'email', 'url', 'status',
  'referenced_object', 'select', 'ipaddress',
] satisfies AttributeType[]);

export function validateContract(document: AssetsImportDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);

  // --- Schema: object types and attributes ---
  for (const item of flattened) {
    const { objectType, jsonPath } = item;

    if (!objectType.externalId.trim()) {
      diagnostics.push({
        code: 'EXTERNAL_ID_EMPTY',
        severity: 'error',
        message: 'An object type has an empty externalId.',
        path: `${jsonPath}/externalId`,
        suggestion: 'externalId must be a non-empty string with no leading or trailing whitespace.',
      });
    }

    if (!objectType.name.trim()) {
      diagnostics.push({
        code: 'NAME_EMPTY',
        severity: 'error',
        message: `Object type "${objectType.externalId}" has an empty name.`,
        path: `${jsonPath}/name`,
        suggestion: 'name must be a non-empty string.',
      });
    }

    for (const [attributeIndex, attribute] of (objectType.attributes ?? []).entries()) {
      const attrPath = `${jsonPath}/attributes/${attributeIndex}`;

      if (!attribute.externalId.trim()) {
        diagnostics.push({
          code: 'EXTERNAL_ID_EMPTY',
          severity: 'error',
          message: `An attribute in object type "${objectType.externalId}" has an empty externalId.`,
          path: `${attrPath}/externalId`,
          suggestion: 'externalId must be a non-empty string with no leading or trailing whitespace.',
        });
      }

      if (!attribute.name.trim()) {
        diagnostics.push({
          code: 'NAME_EMPTY',
          severity: 'error',
          message: `Attribute "${attribute.externalId}" in "${objectType.externalId}" has an empty name.`,
          path: `${attrPath}/name`,
          suggestion: 'name must be a non-empty string.',
        });
      }

      if (!VALID_ATTRIBUTE_TYPES.has(attribute.type)) {
        diagnostics.push({
          code: 'ATTRIBUTE_TYPE_INVALID',
          severity: 'error',
          message: `Attribute "${attribute.externalId}" has invalid type "${attribute.type}".`,
          path: `${attrPath}/type`,
          suggestion: `Valid types: ${[...VALID_ATTRIBUTE_TYPES].join(', ')}.`,
          metadata: { objectTypeExternalId: objectType.externalId, attributeExternalId: attribute.externalId },
        });
      }

      const min = attribute.minimumCardinality;
      const max = attribute.maximumCardinality;

      if (min !== undefined && min < 0) {
        diagnostics.push({
          code: 'CARDINALITY_NEGATIVE',
          severity: 'error',
          message: `Attribute "${attribute.externalId}" has negative minimumCardinality (${min}).`,
          path: `${attrPath}/minimumCardinality`,
          suggestion: 'minimumCardinality must be 0 or greater.',
        });
      }

      // -1 is the conventional sentinel for "unlimited" — skip negativity and range checks for it
      if (max !== undefined && max < 0 && max !== -1) {
        diagnostics.push({
          code: 'CARDINALITY_NEGATIVE',
          severity: 'error',
          message: `Attribute "${attribute.externalId}" has negative maximumCardinality (${max}).`,
          path: `${attrPath}/maximumCardinality`,
          suggestion: 'Use -1 for unlimited, or 0 or greater for a fixed maximum.',
        });
      }

      if (min !== undefined && max !== undefined && max !== -1 && min > max) {
        diagnostics.push({
          code: 'CARDINALITY_RANGE_INVALID',
          severity: 'error',
          message: `Attribute "${attribute.externalId}" has minimumCardinality (${min}) greater than maximumCardinality (${max}).`,
          path: `${attrPath}/minimumCardinality`,
          relatedPaths: [`${attrPath}/maximumCardinality`],
          suggestion: 'minimumCardinality must be ≤ maximumCardinality, or set maximumCardinality to -1 for unlimited.',
        });
      }
    }
  }

  // --- Mapping: selector and locator rules ---
  const seenSelectors = new Map<string, number>();

  for (const [mappingIndex, mapping] of document.mapping.objectTypeMappings.entries()) {
    const basePath = `/mapping/objectTypeMappings/${mappingIndex}`;

    if (!mapping.selector.trim()) {
      diagnostics.push({
        code: 'SELECTOR_EMPTY',
        severity: 'error',
        message: `Mapping for "${mapping.objectTypeExternalId}" has an empty selector.`,
        path: `${basePath}/selector`,
        suggestion: 'selector must be a non-empty string that identifies the data source path (e.g. "users" or "$.employees").',
      });
    } else {
      const existingIndex = seenSelectors.get(mapping.selector);
      if (existingIndex !== undefined) {
        diagnostics.push({
          code: 'SELECTOR_DUPLICATE',
          severity: 'error',
          message: `Mapping for "${mapping.objectTypeExternalId}" uses selector "${mapping.selector}" which is already used by another mapping.`,
          path: `${basePath}/selector`,
          relatedPaths: [`/mapping/objectTypeMappings/${existingIndex}/selector`],
          suggestion: 'Each mapping must use a unique selector value.',
          metadata: { objectTypeExternalId: mapping.objectTypeExternalId },
        });
      } else {
        seenSelectors.set(mapping.selector, mappingIndex);
      }
    }

    for (const [attrIndex, attrMapping] of mapping.attributesMapping.entries()) {
      const attrPath = `${basePath}/attributesMapping/${attrIndex}`;

      if (!attrMapping.attributeLocators || attrMapping.attributeLocators.length === 0) {
        diagnostics.push({
          code: 'ATTRIBUTE_LOCATORS_MISSING',
          severity: 'warning',
          message: `Attribute mapping for "${attrMapping.attributeExternalId}" has no attributeLocators — data cannot be imported for this attribute.`,
          path: attrPath,
          suggestion: 'Add at least one attributeLocator (the source field path) to enable data import for this attribute.',
          metadata: {
            objectTypeExternalId: mapping.objectTypeExternalId,
            attributeExternalId: attrMapping.attributeExternalId,
          },
        });
      }
    }
  }

  return diagnostics;
}
