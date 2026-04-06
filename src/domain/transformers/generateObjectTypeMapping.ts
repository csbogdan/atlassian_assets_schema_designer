import type {
  AttributeMappingDefinition,
  DocumentIndexes,
  FlattenedObjectType,
  ObjectAttributeDefinition,
  ObjectTypeMappingDefinition,
} from '@/domain/model/types';

function toLocator(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

function isExternalIdPart(attribute: ObjectAttributeDefinition): boolean {
  if (attribute.label) return true;
  // Unique + required is a strong identity signal
  if (attribute.unique && (attribute.minimumCardinality ?? 0) >= 1) return true;
  return false;
}

function getLabelAttributeName(
  referenceObjectTypeExternalId: string | undefined,
  indexes: DocumentIndexes | undefined,
): string {
  if (!referenceObjectTypeExternalId || !indexes) return 'Name';
  const target = indexes.objectTypesByExternalId.get(referenceObjectTypeExternalId);
  if (!target) return 'Name';
  return target.effectiveAttributes.find((a) => a.label)?.name ?? 'Name';
}

function generateAttributeMapping(
  attribute: ObjectAttributeDefinition,
  indexes?: DocumentIndexes,
): AttributeMappingDefinition {
  const locator = toLocator(attribute.name);
  const mapping: AttributeMappingDefinition = {
    attributeExternalId: attribute.externalId,
    attributeName: attribute.name,
    attributeLocators: [locator],
    externalIdPart: isExternalIdPart(attribute),
  };

  if (attribute.type === 'referenced_object') {
    const labelName = getLabelAttributeName(attribute.referenceObjectTypeExternalId, indexes);
    mapping.objectMappingIQL = `"${labelName}" = \${${locator}}`;
  }

  if (attribute.type === 'select' && attribute.typeValues && attribute.typeValues.length > 0) {
    mapping.valueMapping = Object.fromEntries(attribute.typeValues.map((v) => [v, v]));
  }

  return mapping;
}

export function generateObjectTypeMapping(
  flattened: FlattenedObjectType,
  selector?: string,
  indexes?: DocumentIndexes,
): ObjectTypeMappingDefinition {
  return {
    objectTypeExternalId: flattened.objectType.externalId,
    objectTypeName: flattened.objectType.name,
    selector: selector ?? flattened.objectType.name.toLowerCase().replace(/\s+/g, '-'),
    description: flattened.objectType.description ?? flattened.objectType.name,
    unknownValues: 'ADD',
    attributesMapping: flattened.effectiveAttributes.map((a) => generateAttributeMapping(a, indexes)),
  };
}
