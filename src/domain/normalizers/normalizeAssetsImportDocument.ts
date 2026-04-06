import { z } from 'zod';
import type { AssetsImportDocument, Diagnostic } from '@/domain/model/types';

const attributeSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.string(),
  label: z.boolean().optional(),
  referenceObjectTypeName: z.string().optional(),
  referenceObjectTypeExternalId: z.string().optional(),
  typeValues: z.array(z.string()).optional(),
  minimumCardinality: z.number().optional(),
  maximumCardinality: z.number().optional(),
  unique: z.boolean().optional(),
}).passthrough();

const objectTypeSchema: z.ZodType = z.lazy(() =>
  z.object({
    externalId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    inheritance: z.boolean().optional(),
    attributes: z.array(attributeSchema).optional(),
    children: z.array(objectTypeSchema).optional(),
  }).passthrough(),
);

const documentSchema = z.object({
  $schema: z.string().optional(),
  schema: z.object({
    objectSchema: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      objectTypes: z.array(objectTypeSchema),
    }).passthrough(),
    statusSchema: z.record(z.unknown()).optional(),
  }).passthrough(),
  mapping: z.object({
    objectTypeMappings: z.array(z.object({
      objectTypeExternalId: z.string(),
      objectTypeName: z.string().optional(),
      selector: z.string(),
      description: z.string().optional(),
      unknownValues: z.string().optional(),
      attributesMapping: z.array(z.object({
        attributeExternalId: z.string(),
        attributeName: z.string().optional(),
        attributeLocators: z.array(z.string()).optional(),
        externalIdPart: z.boolean().optional(),
        objectMappingIQL: z.string().optional(),
        valueMapping: z.record(z.string()).optional(),
      }).passthrough()),
    }).passthrough()),
  }).passthrough(),
}).passthrough();

type ParseResult = {
  document?: AssetsImportDocument;
  diagnostics: Diagnostic[];
  rawJson: string;
};

function encodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function toJsonPointer(path: Array<string | number>): string {
  if (path.length === 0) {
    return '/';
  }
  return `/${path.map((segment) => encodeJsonPointerSegment(String(segment))).join('/')}`;
}

function toZodDiagnostics(issues: z.ZodIssue[]): Diagnostic[] {
  return issues.map((issue) => ({
    code: 'SCHEMA_VALIDATION_ERROR',
    severity: 'error',
    message: issue.message,
    path: toJsonPointer(issue.path),
  }));
}

export function parseAssetsImportDocument(input: string): ParseResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(input) as unknown;
  } catch (error) {
    return {
      document: undefined,
      rawJson: input,
      diagnostics: [{
        code: 'JSON_PARSE_ERROR',
        severity: 'error',
        message: error instanceof Error ? error.message : 'Invalid JSON.',
        path: '/',
      }],
    };
  }

  const parsed = documentSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return {
      document: undefined,
      rawJson: input,
      diagnostics: toZodDiagnostics(parsed.error.issues),
    };
  }

  return {
    document: parsed.data as AssetsImportDocument,
    rawJson: JSON.stringify(parsed.data, null, 2),
    diagnostics: [],
  };
}

export function normalizeAssetsImportDocument(input: unknown): AssetsImportDocument {
  return documentSchema.parse(input) as AssetsImportDocument;
}
