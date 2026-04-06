import 'server-only';

import type { AssetsImportDocument, AttributeMappingDefinition, ObjectAttributeDefinition, ObjectTypeMappingDefinition, ObjectTypeDefinition } from '@/domain/model/types';

export type ChangeEvent = {
  path: string;
  oldValue: unknown;
  newValue: unknown;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function flattenObjectTypes(types: ObjectTypeDefinition[], prefix = 'schema.objectTypes'): Map<string, ObjectTypeDefinition> {
  const map = new Map<string, ObjectTypeDefinition>();
  for (const t of types) {
    map.set(`${prefix}.${t.externalId}`, t);
    if (t.children?.length) {
      for (const [k, v] of flattenObjectTypes(t.children, `${prefix}.${t.externalId}.children`)) {
        map.set(k, v);
      }
    }
  }
  return map;
}

function scalar(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function recordField(events: ChangeEvent[], path: string, oldVal: unknown, newVal: unknown) {
  if (scalar(oldVal) !== scalar(newVal)) {
    events.push({ path, oldValue: oldVal ?? null, newValue: newVal ?? null });
  }
}

// ── object type diff ──────────────────────────────────────────────────────────

const OT_SCALAR_FIELDS: Array<keyof ObjectTypeDefinition> = [
  'name', 'description', 'iconKey', 'inheritance', 'abstractObject',
];

const ATTR_SCALAR_FIELDS: Array<keyof ObjectAttributeDefinition> = [
  'name', 'description', 'type', 'label', 'unique',
  'minimumCardinality', 'maximumCardinality',
  'referenceObjectTypeExternalId', 'referenceObjectTypeName',
];

function diffAttributes(
  events: ChangeEvent[],
  prefix: string,
  oldAttrs: ObjectAttributeDefinition[],
  newAttrs: ObjectAttributeDefinition[],
) {
  const oldMap = new Map(oldAttrs.map((a) => [a.externalId, a]));
  const newMap = new Map(newAttrs.map((a) => [a.externalId, a]));

  for (const [id, oldA] of oldMap) {
    if (!newMap.has(id)) {
      events.push({ path: `${prefix}.attributes.${id}`, oldValue: oldA, newValue: null });
      continue;
    }
    const newA = newMap.get(id)!;
    for (const field of ATTR_SCALAR_FIELDS) {
      recordField(events, `${prefix}.attributes.${id}.${field}`, oldA[field], newA[field]);
    }
    // typeValues array
    if (scalar(oldA.typeValues) !== scalar(newA.typeValues)) {
      events.push({ path: `${prefix}.attributes.${id}.typeValues`, oldValue: oldA.typeValues ?? null, newValue: newA.typeValues ?? null });
    }
  }

  for (const [id, newA] of newMap) {
    if (!oldMap.has(id)) {
      events.push({ path: `${prefix}.attributes.${id}`, oldValue: null, newValue: newA });
    }
  }
}

function diffObjectTypes(
  events: ChangeEvent[],
  oldTypes: ObjectTypeDefinition[],
  newTypes: ObjectTypeDefinition[],
) {
  const oldMap = flattenObjectTypes(oldTypes);
  const newMap = flattenObjectTypes(newTypes);

  for (const [path, oldT] of oldMap) {
    if (!newMap.has(path)) {
      events.push({ path, oldValue: { externalId: oldT.externalId, name: oldT.name }, newValue: null });
      continue;
    }
    const newT = newMap.get(path)!;
    for (const field of OT_SCALAR_FIELDS) {
      recordField(events, `${path}.${field}`, oldT[field], newT[field]);
    }
    diffAttributes(events, path, oldT.attributes ?? [], newT.attributes ?? []);
  }

  for (const [path, newT] of newMap) {
    if (!oldMap.has(path)) {
      events.push({ path, oldValue: null, newValue: { externalId: newT.externalId, name: newT.name } });
    }
  }
}

// ── mapping diff ──────────────────────────────────────────────────────────────

const MAPPING_SCALAR_FIELDS: Array<keyof ObjectTypeMappingDefinition> = [
  'objectTypeName', 'selector', 'description', 'unknownValues',
];

const ATTR_MAPPING_SCALAR_FIELDS: Array<keyof AttributeMappingDefinition> = [
  'attributeName', 'externalIdPart', 'objectMappingIQL',
];

function diffAttrMappings(
  events: ChangeEvent[],
  prefix: string,
  oldList: AttributeMappingDefinition[],
  newList: AttributeMappingDefinition[],
) {
  const oldMap = new Map(oldList.map((a) => [a.attributeExternalId, a]));
  const newMap = new Map(newList.map((a) => [a.attributeExternalId, a]));

  for (const [id, oldA] of oldMap) {
    if (!newMap.has(id)) {
      events.push({ path: `${prefix}.attributesMapping.${id}`, oldValue: oldA, newValue: null });
      continue;
    }
    const newA = newMap.get(id)!;
    for (const field of ATTR_MAPPING_SCALAR_FIELDS) {
      recordField(events, `${prefix}.attributesMapping.${id}.${field}`, oldA[field], newA[field]);
    }
    if (scalar(oldA.attributeLocators) !== scalar(newA.attributeLocators)) {
      events.push({ path: `${prefix}.attributesMapping.${id}.attributeLocators`, oldValue: oldA.attributeLocators ?? null, newValue: newA.attributeLocators ?? null });
    }
  }
  for (const [id, newA] of newMap) {
    if (!oldMap.has(id)) {
      events.push({ path: `${prefix}.attributesMapping.${id}`, oldValue: null, newValue: newA });
    }
  }
}

function diffMappings(
  events: ChangeEvent[],
  oldMappings: ObjectTypeMappingDefinition[],
  newMappings: ObjectTypeMappingDefinition[],
) {
  const oldMap = new Map(oldMappings.map((m) => [m.objectTypeExternalId, m]));
  const newMap = new Map(newMappings.map((m) => [m.objectTypeExternalId, m]));

  for (const [id, oldM] of oldMap) {
    if (!newMap.has(id)) {
      events.push({ path: `mapping.objectTypeMappings.${id}`, oldValue: { objectTypeExternalId: id }, newValue: null });
      continue;
    }
    const newM = newMap.get(id)!;
    const prefix = `mapping.objectTypeMappings.${id}`;
    for (const field of MAPPING_SCALAR_FIELDS) {
      recordField(events, `${prefix}.${field}`, oldM[field], newM[field]);
    }
    diffAttrMappings(events, prefix, oldM.attributesMapping, newM.attributesMapping);
  }
  for (const [id, newM] of newMap) {
    if (!oldMap.has(id)) {
      events.push({ path: `mapping.objectTypeMappings.${id}`, oldValue: null, newValue: { objectTypeExternalId: id, objectTypeName: newM.objectTypeName } });
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export function diffDocuments(
  oldDoc: AssetsImportDocument,
  newDoc: AssetsImportDocument,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  diffObjectTypes(events, oldDoc.schema.objectSchema.objectTypes, newDoc.schema.objectSchema.objectTypes);
  diffMappings(events, oldDoc.mapping.objectTypeMappings, newDoc.mapping.objectTypeMappings);
  return events;
}
