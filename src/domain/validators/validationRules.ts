export type ValidationCategory = 'contract' | 'business' | 'cross-reference' | 'impact' | 'semantic';

export type ValidationRuleDefinition = {
  code: string;
  name: string;
  description: string;
  defaultSeverity: 'error' | 'warning' | 'info';
  category: ValidationCategory;
};

export const VALIDATION_RULES: ValidationRuleDefinition[] = [
  // Contract
  { code: 'ATTRIBUTE_TYPE_INVALID', name: 'Invalid attribute type', description: 'Attribute type must be one of the 13 valid Atlassian types.', defaultSeverity: 'error', category: 'contract' },
  { code: 'CARDINALITY_NEGATIVE', name: 'Negative cardinality', description: 'minimumCardinality and maximumCardinality must be ≥ 0.', defaultSeverity: 'error', category: 'contract' },
  { code: 'CARDINALITY_RANGE_INVALID', name: 'Invalid cardinality range', description: 'minimumCardinality must be ≤ maximumCardinality.', defaultSeverity: 'error', category: 'contract' },
  { code: 'EXTERNAL_ID_EMPTY', name: 'Empty externalId', description: 'externalId must be a non-empty string.', defaultSeverity: 'error', category: 'contract' },
  { code: 'NAME_EMPTY', name: 'Empty name', description: 'name must be a non-empty string.', defaultSeverity: 'error', category: 'contract' },
  { code: 'SELECTOR_EMPTY', name: 'Empty selector', description: 'Mapping selector must be a non-empty string.', defaultSeverity: 'error', category: 'contract' },
  { code: 'SELECTOR_DUPLICATE', name: 'Duplicate selector', description: 'Each mapping must use a unique selector value.', defaultSeverity: 'error', category: 'contract' },
  { code: 'ATTRIBUTE_LOCATORS_MISSING', name: 'Missing attribute locators', description: 'Attribute mapping has no locators — data cannot be imported for this attribute.', defaultSeverity: 'warning', category: 'contract' },
  // Inheritance conflicts
  { code: 'INHERITED_ATTRIBUTE_TYPE_CONFLICT', name: 'Inherited attribute type conflict', description: 'Inherited attribute redefined with different type.', defaultSeverity: 'warning', category: 'business' },
  // Business rules
  { code: 'LABEL_ATTRIBUTE_MISSING', name: 'Missing label attribute', description: 'Object type has no label attribute. The Atlassian importer uses this as the display name.', defaultSeverity: 'warning', category: 'business' },
  { code: 'LABEL_ATTRIBUTE_DUPLICATE', name: 'Duplicate label attribute', description: 'Only one attribute per object type should be marked as label=true.', defaultSeverity: 'warning', category: 'business' },
  { code: 'VALUE_MAPPING_INCOMPLETE', name: 'Incomplete status value mapping', description: 'Status attribute typeValues are defined in the schema but the mapping is missing valueMapping entries for one or more of them.', defaultSeverity: 'warning', category: 'business' },
  { code: 'DUPLICATE_ATTRIBUTE_NAME', name: 'Duplicate attribute name', description: 'An object type has two or more attributes with the same name.', defaultSeverity: 'error', category: 'business' },
  { code: 'DUPLICATE_MAPPING_OBJECT_TYPE', name: 'Duplicate mapping', description: 'Each object type can only have one mapping entry.', defaultSeverity: 'error', category: 'business' },
  { code: 'IQL_ON_NON_REFERENCED_ATTRIBUTE', name: 'IQL on non-reference attribute', description: 'objectMappingIQL is only valid on referenced_object attributes.', defaultSeverity: 'warning', category: 'business' },
  // Cross-reference
  { code: 'DUPLICATE_OBJECT_TYPE_EXTERNAL_ID', name: 'Duplicate object type externalId', description: 'Each object type externalId must be globally unique.', defaultSeverity: 'error', category: 'cross-reference' },
  { code: 'DUPLICATE_ATTRIBUTE_EXTERNAL_ID', name: 'Duplicate attribute externalId', description: 'Attribute externalIds must be globally unique across the entire schema. Reusing the same externalId in multiple object types causes a duplicate key violation on the Atlassian backend (obj_type_attr__workspace_id__external_id__unique_idx).', defaultSeverity: 'error', category: 'cross-reference' },
  { code: 'REFERENCED_OBJECT_TARGET_MISSING', name: 'Referenced object target missing', description: 'referenced_object attributes must have referenceObjectTypeExternalId set.', defaultSeverity: 'error', category: 'cross-reference' },
  { code: 'BREAKING_MAPPING_OBJECT_TYPE_MISSING', name: 'Mapping references unknown object type', description: 'Mapping objectTypeExternalId does not exist in the schema.', defaultSeverity: 'error', category: 'cross-reference' },
  { code: 'MAPPING_OBJECT_TYPE_NAME_MISMATCH', name: 'Mapping object type name mismatch', description: 'Mapping objectTypeName does not match the schema object type name.', defaultSeverity: 'warning', category: 'cross-reference' },
  { code: 'MAPPING_EXTERNAL_ID_PART_MISSING', name: 'No externalIdPart in mapping', description: 'Every mapping must have at least one attribute marked as externalIdPart.', defaultSeverity: 'warning', category: 'cross-reference' },
  { code: 'BREAKING_MAPPING_ATTRIBUTE_MISSING', name: 'Mapping references unknown attribute', description: 'Attribute mapping attributeExternalId does not exist in the schema.', defaultSeverity: 'error', category: 'cross-reference' },
  { code: 'MAPPING_ATTRIBUTE_NAME_MISMATCH', name: 'Mapping attribute name mismatch', description: 'Attribute mapping attributeName does not match the schema attribute name.', defaultSeverity: 'warning', category: 'cross-reference' },
  { code: 'REFERENCED_OBJECT_MAPPING_IQL_MISSING', name: 'referenced_object missing IQL', description: 'Mappings for referenced_object attributes should define objectMappingIQL.', defaultSeverity: 'warning', category: 'cross-reference' },
  // Impact analysis
  { code: 'BREAKING_ATTRIBUTE_TYPE_CHANGED', name: 'Attribute type changed', description: 'Attribute types are immutable. Drop and recreate with a new externalId.', defaultSeverity: 'error', category: 'impact' },
  { code: 'BREAKING_SELECTOR_CHANGED', name: 'Selector changed', description: 'Changing the selector may break scheduled import jobs.', defaultSeverity: 'warning', category: 'impact' },
  { code: 'BREAKING_EXTERNAL_ID_PART_REMOVED', name: 'External ID part removed', description: 'Removing externalIdPart breaks object identity for the importer.', defaultSeverity: 'error', category: 'impact' },
  { code: 'BREAKING_REFERENCE_TARGET_CHANGED', name: 'Reference target changed', description: 'The referenced object type changed — review objectMappingIQL.', defaultSeverity: 'warning', category: 'impact' },
  { code: 'BREAKING_OBJECT_TYPE_REMOVED', name: 'Mapped object type removed', description: 'Object type was removed but still has mappings in the baseline.', defaultSeverity: 'error', category: 'impact' },
  { code: 'BREAKING_MAPPED_ATTRIBUTE_REMOVED', name: 'Mapped attribute removed', description: 'Attribute was removed but is still referenced in a mapping.', defaultSeverity: 'error', category: 'impact' },
  // Semantic diff
  { code: 'SEMANTIC_OBJECT_TYPE_ADDED', name: 'Object type added', description: 'A new object type was added since the baseline.', defaultSeverity: 'info', category: 'semantic' },
  { code: 'SEMANTIC_OBJECT_TYPE_REMOVED', name: 'Object type removed', description: 'An object type was removed since the baseline.', defaultSeverity: 'warning', category: 'semantic' },
  { code: 'SEMANTIC_MAPPING_ADDED', name: 'Mapping added', description: 'A new mapping was added since the baseline.', defaultSeverity: 'info', category: 'semantic' },
  { code: 'SEMANTIC_MAPPING_REMOVED', name: 'Mapping removed', description: 'A mapping was removed since the baseline.', defaultSeverity: 'warning', category: 'semantic' },
  { code: 'SEMANTIC_ATTRIBUTE_ADDED', name: 'Attribute added', description: 'An attribute was added since the baseline.', defaultSeverity: 'info', category: 'semantic' },
  { code: 'SEMANTIC_ATTRIBUTE_REMOVED', name: 'Attribute removed', description: 'An attribute was removed since the baseline.', defaultSeverity: 'warning', category: 'semantic' },
];

export const VALIDATION_RULES_BY_CODE = new Map(VALIDATION_RULES.map((r) => [r.code, r]));
export const VALIDATION_CATEGORIES: ValidationCategory[] = ['contract', 'business', 'cross-reference', 'impact', 'semantic'];

/** Returns true if the rule is enabled given the config. Absent = enabled (default on). */
export function isRuleEnabled(code: string, config: Record<string, boolean>): boolean {
  return config[code] !== false;
}
