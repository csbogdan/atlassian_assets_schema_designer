import type { AssetsImportDocument } from '@/domain/model/types';

const GUID_PATTERN = /cmdb::externalId\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

function cleanNameForId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function generateUniqueName(baseName: string, used: Set<string>): string {
  if (!used.has(baseName)) {
    used.add(baseName);
    return baseName;
  }
  let counter = 2;
  while (used.has(`${baseName}-${counter}`)) counter++;
  const unique = `${baseName}-${counter}`;
  used.add(unique);
  return unique;
}

export type GuidMapping = { guid: string; replacement: string; context: string };

type ObjectTypeLike = {
  externalId?: string;
  name?: string;
  attributes?: Array<{ externalId?: string; name?: string }>;
  children?: unknown[];
};

function collectExistingIds(document: AssetsImportDocument): Set<string> {
  const existing = new Set<string>();
  function walk(obj: ObjectTypeLike): void {
    if (typeof obj.externalId === 'string' && !obj.externalId.startsWith('cmdb::externalId/')) {
      existing.add(obj.externalId);
    }
    for (const attr of obj.attributes ?? []) {
      if (typeof attr.externalId === 'string' && !attr.externalId.startsWith('cmdb::externalId/')) {
        existing.add(attr.externalId);
      }
    }
    for (const child of (obj.children ?? [])) {
      walk(child as ObjectTypeLike);
    }
  }
  for (const ot of document.schema.objectSchema.objectTypes) {
    walk(ot as ObjectTypeLike);
  }
  return existing;
}

export function buildGuidMappings(document: AssetsImportDocument): GuidMapping[] {
  const mappings: GuidMapping[] = [];
  const used = collectExistingIds(document);
  const guidToReplacement = new Map<string, string>();

  function processObjectType(obj: ObjectTypeLike): void {
    const name = obj.name ?? 'unknown';
    const objClean = cleanNameForId(name);
    const objBase = `cmdb-${objClean}`;

    if (typeof obj.externalId === 'string' && obj.externalId.startsWith('cmdb::externalId/')) {
      const m = obj.externalId.match(/cmdb::externalId\/([0-9a-f-]{36})/);
      if (m && !guidToReplacement.has(m[1])) {
        const replacement = generateUniqueName(objBase, used);
        guidToReplacement.set(m[1], replacement);
        mappings.push({ guid: m[1], replacement, context: `Object type: ${name}` });
      }
    }

    for (const attr of obj.attributes ?? []) {
      if (typeof attr.externalId === 'string' && attr.externalId.startsWith('cmdb::externalId/')) {
        const m = attr.externalId.match(/cmdb::externalId\/([0-9a-f-]{36})/);
        if (m && !guidToReplacement.has(m[1])) {
          const attrClean = cleanNameForId(attr.name ?? 'unknown');
          const replacement = generateUniqueName(`${objClean}-${attrClean}`, used);
          guidToReplacement.set(m[1], replacement);
          mappings.push({ guid: m[1], replacement, context: `Attribute: ${name}.${attr.name ?? ''}` });
        }
      }
    }

    for (const child of (obj.children ?? [])) {
      processObjectType(child as ObjectTypeLike);
    }
  }

  for (const ot of document.schema.objectSchema.objectTypes) {
    processObjectType(ot as ObjectTypeLike);
  }

  // Second pass: catch any remaining GUIDs (e.g. referenceObjectTypeExternalId)
  const raw = JSON.stringify(document);
  const allGuids = [...raw.matchAll(GUID_PATTERN)];
  for (const m of allGuids) {
    const guid = m[1];
    if (!guidToReplacement.has(guid)) {
      const replacement = generateUniqueName(`cmdb-ref-${guid.slice(0, 8)}`, used);
      guidToReplacement.set(guid, replacement);
      mappings.push({ guid, replacement, context: 'Reference (unmapped)' });
    }
  }

  return mappings;
}

export function applyGuidMappings(document: AssetsImportDocument, mappings: GuidMapping[]): AssetsImportDocument {
  let raw = JSON.stringify(document);
  for (const { guid, replacement } of mappings) {
    raw = raw.replaceAll(`cmdb::externalId/${guid}`, replacement);
  }
  return JSON.parse(raw) as AssetsImportDocument;
}
