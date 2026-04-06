import type { DocumentIndexes, FlattenedObjectType, ObjectTypeMappingDefinition } from '@/domain/model/types';
import { generateObjectTypeMapping } from './generateObjectTypeMapping';

/**
 * Clone a source mapping's structure adapted to a target object type.
 * Attributes that match by name carry over their locators/IQL/valueMapping;
 * unmatched target attributes get fresh generated stubs.
 */
export function cloneMapping(
  source: ObjectTypeMappingDefinition,
  target: FlattenedObjectType,
  selector?: string,
  indexes?: DocumentIndexes,
): ObjectTypeMappingDefinition {
  const sourceByName = new Map<string, (typeof source.attributesMapping)[number]>();
  for (const attrMapping of source.attributesMapping) {
    if (attrMapping.attributeName) {
      sourceByName.set(attrMapping.attributeName.toLowerCase(), attrMapping);
    }
  }

  const fresh = generateObjectTypeMapping(target, selector, indexes);

  const attributesMapping = fresh.attributesMapping.map((generated) => {
    const match = sourceByName.get((generated.attributeName ?? '').toLowerCase());
    if (!match) return generated;
    return {
      ...generated,
      attributeLocators: match.attributeLocators ?? generated.attributeLocators,
      ...(match.objectMappingIQL !== undefined ? { objectMappingIQL: match.objectMappingIQL } : {}),
      ...(match.valueMapping !== undefined ? { valueMapping: match.valueMapping } : {}),
    };
  });

  return {
    objectTypeExternalId: target.objectType.externalId,
    objectTypeName: target.objectType.name,
    selector: selector ?? target.objectType.name.toLowerCase().replace(/\s+/g, '-'),
    description: source.description ?? target.objectType.description ?? target.objectType.name,
    unknownValues: source.unknownValues ?? 'ADD',
    attributesMapping,
  };
}
