import type { AssetsImportDocument, ObjectAttributeDefinition } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatCardinality(value: number | undefined): string {
  if (value === undefined) return '';
  return String(value);
}

const HEADER =
  'objectTypeName,objectTypeExternalId,objectTypeDescription,attributeName,attributeExternalId,attributeDescription,type,minimumCardinality,maximumCardinality,label,unique,referenceObjectTypeName,referenceObjectTypeExternalId,typeValues,inherited';

function buildRow(
  objectTypeName: string,
  objectTypeExternalId: string,
  objectTypeDescription: string,
  attr: ObjectAttributeDefinition,
  inherited: boolean,
): string {
  const typeValues = Array.isArray(attr.typeValues) ? attr.typeValues.join('|') : '';
  const fields = [
    csvEscape(objectTypeName),
    csvEscape(objectTypeExternalId),
    csvEscape(objectTypeDescription),
    csvEscape(attr.name),
    csvEscape(attr.externalId),
    csvEscape(attr.description ?? ''),
    csvEscape(attr.type),
    csvEscape(formatCardinality(attr.minimumCardinality)),
    csvEscape(formatCardinality(attr.maximumCardinality)),
    csvEscape(attr.label === true ? 'true' : 'false'),
    csvEscape(attr.unique === true ? 'true' : 'false'),
    csvEscape(attr.referenceObjectTypeName ?? ''),
    csvEscape(attr.referenceObjectTypeExternalId ?? ''),
    csvEscape(typeValues),
    csvEscape(String(inherited)),
  ];
  return fields.join(',');
}

export function exportToCsv(document: AssetsImportDocument): string {
  const rows: string[] = [HEADER];

  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);

  for (const item of flattened) {
    const { objectType, effectiveAttributes } = item;
    const localIds = new Set<string>(
      (objectType.attributes ?? []).map((a) => a.externalId),
    );

    for (const attr of effectiveAttributes) {
      const inherited = !localIds.has(attr.externalId);
      rows.push(buildRow(
        objectType.name,
        objectType.externalId,
        objectType.description ?? '',
        attr,
        inherited,
      ));
    }
  }

  return rows.join('\n');
}
