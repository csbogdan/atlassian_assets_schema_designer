export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticMetadata = {
  objectTypeExternalId?: string;
  attributeExternalId?: string;
  /** For BREAKING_ATTRIBUTE_TYPE_CHANGED: the type in the baseline (before the change). */
  previousType?: string;
  /** For BREAKING_ATTRIBUTE_TYPE_CHANGED: the type in the current document (after the change). */
  newType?: string;
};

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string;
  relatedPaths?: string[];
  suggestion?: string;
  /** Structured data for programmatic consumers (e.g. autofix). Never parse `message` to extract these. */
  metadata?: DiagnosticMetadata;
};

export type AttributeType =
  | 'text'
  | 'textarea'
  | 'integer'
  | 'double'
  | 'boolean'
  | 'date'
  | 'time'
  | 'date_time'
  | 'email'
  | 'url'
  | 'status'
  | 'referenced_object'
  | 'select'
  | 'ipaddress';

export type ObjectAttributeDefinition = {
  externalId: string;
  name: string;
  description?: string;
  type: AttributeType | string;
  label?: boolean;
  referenceObjectTypeName?: string;
  referenceObjectTypeExternalId?: string;
  typeValues?: string[];
  minimumCardinality?: number;
  maximumCardinality?: number;
  unique?: boolean;
  [key: string]: unknown;
};

export type ObjectTypeDefinition = {
  externalId: string;
  name: string;
  description?: string;
  iconKey?: string;
  inheritance?: boolean;
  abstractObject?: boolean;
  attributes?: ObjectAttributeDefinition[];
  children?: ObjectTypeDefinition[];
  [key: string]: unknown;
};

export type ObjectSchemaDefinition = {
  name?: string;
  description?: string;
  objectTypes: ObjectTypeDefinition[];
  [key: string]: unknown;
};

export type StatusSchemaDefinition = {
  statuses?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type AttributeMappingDefinition = {
  attributeExternalId: string;
  attributeName?: string;
  attributeLocators?: string[];
  externalIdPart?: boolean;
  objectMappingIQL?: string;
  valueMapping?: Record<string, string>;
  [key: string]: unknown;
};

export type ObjectTypeMappingDefinition = {
  objectTypeExternalId: string;
  objectTypeName?: string;
  selector: string;
  description?: string;
  unknownValues?: string;
  attributesMapping: AttributeMappingDefinition[];
  [key: string]: unknown;
};

export type AssetsImportDocument = {
  $schema?: string;
  schema: {
    objectSchema: ObjectSchemaDefinition;
    statusSchema?: StatusSchemaDefinition;
    [key: string]: unknown;
  };
  mapping: {
    objectTypeMappings: ObjectTypeMappingDefinition[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type FlattenedObjectType = {
  objectType: ObjectTypeDefinition;
  parentExternalId?: string;
  path: string;
  jsonPath: string;
  depth: number;
  inheritedAttributes: ObjectAttributeDefinition[];
  effectiveAttributes: ObjectAttributeDefinition[];
  attributeLookup: Map<string, { attribute: ObjectAttributeDefinition; path: string }>;
};

export type DocumentIndexes = {
  objectTypesByExternalId: Map<string, FlattenedObjectType>;
  mappingsByObjectTypeExternalId: Map<string, ObjectTypeMappingDefinition>;
};

export type ProjectSettings = {
  atlassianSite?: string;      // e.g. "yourcompany.atlassian.net"
  atlassianEmail?: string;     // for Basic auth (export/delete)
  atlassianApiToken?: string;  // used as Bearer token (import) and Basic auth token (export/delete)
  assetsSchemaId?: string;     // for export/delete tools
};

export type ProjectEnvironment = {
  id: string;
  /** Display name, e.g. "Production" or "Staging" */
  name: string;
  /** Atlassian Bearer token scoped to this import source */
  token: string;
};
