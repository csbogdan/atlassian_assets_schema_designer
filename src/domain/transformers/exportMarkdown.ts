import type { AssetsImportDocument, ObjectAttributeDefinition } from '@/domain/model/types';
import { flattenObjectTypes } from '@/domain/selectors/indexes';

function formatCardinality(value: number | undefined): string {
  if (value === undefined) return '';
  if (value === -1) return '∞';
  return String(value);
}

function formatBool(value: boolean | undefined): string {
  return value === true ? '✓' : '';
}

function formatAttributeRow(
  attr: ObjectAttributeDefinition,
  isInherited: boolean,
): string {
  const name = isInherited ? `${attr.name} *(inherited)*` : attr.name;
  const min = formatCardinality(attr.minimumCardinality);
  const max = formatCardinality(attr.maximumCardinality);
  const label = formatBool(attr.label);
  const unique = formatBool(attr.unique);
  const description = attr.description ?? '';
  const refType = attr.referenceObjectTypeName
    ? `${attr.referenceObjectTypeName} (\`${attr.referenceObjectTypeExternalId ?? ''}\`)`
    : '';
  const typeValues = Array.isArray(attr.typeValues) && attr.typeValues.length > 0
    ? attr.typeValues.join(', ')
    : '';
  return `| ${name} | ${attr.externalId} | ${attr.type} | ${min} | ${max} | ${label} | ${unique} | ${description} | ${refType} | ${typeValues} |`;
}

export function exportToMarkdown(document: AssetsImportDocument): string {
  const schemaName = document.schema.objectSchema.name ?? 'Unnamed';
  const generatedAt = new Date().toISOString();

  const lines: string[] = [
    `# Schema: ${schemaName}`,
    '',
    `*Generated at ${generatedAt}*`,
    '',
  ];

  const flattened = flattenObjectTypes(document.schema.objectSchema.objectTypes);
  const localAttributeIdSets = new Map<string, Set<string>>();

  for (const item of flattened) {
    const localIds = new Set<string>(
      (item.objectType.attributes ?? []).map((a) => a.externalId),
    );
    localAttributeIdSets.set(item.objectType.externalId, localIds);
  }

  for (const item of flattened) {
    const { objectType, effectiveAttributes } = item;
    const localIds = localAttributeIdSets.get(objectType.externalId) ?? new Set<string>();

    lines.push(`## ${objectType.name} (\`${objectType.externalId}\`)`);
    lines.push('');

    if (objectType.description) {
      lines.push(`> ${objectType.description}`);
      lines.push('');
    }

    const meta: string[] = [];
    if (objectType.abstractObject) meta.push('Abstract');
    if (objectType.inheritance) meta.push('Inheritance enabled');
    if (meta.length) {
      lines.push(`*${meta.join(' · ')}*`);
      lines.push('');
    }

    lines.push('| Attribute | External ID | Type | Min | Max | Label | Unique | Description | Reference Type | Options |');
    lines.push('|-----------|-------------|------|-----|-----|-------|--------|-------------|----------------|---------|');

    for (const attr of effectiveAttributes) {
      const isInherited = !localIds.has(attr.externalId);
      lines.push(formatAttributeRow(attr, isInherited));
    }

    lines.push('');
  }

  return lines.join('\n');
}
