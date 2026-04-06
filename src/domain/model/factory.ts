import type { AssetsImportDocument } from '@/domain/model/types';

export function createBlankDocument(): AssetsImportDocument {
  return {
    schema: {
      objectSchema: {
        name: 'New Schema',
        description: '',
        objectTypes: [],
      },
    },
    mapping: {
      objectTypeMappings: [],
    },
  };
}
