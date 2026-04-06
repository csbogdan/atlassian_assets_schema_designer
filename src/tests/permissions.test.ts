import { describe, it, expect } from 'vitest';
import { getEffectivePermissions } from '@/lib/permissions';

describe('getEffectivePermissions', () => {
  it('unclaimed project (no ownerId): denies all access', () => {
    const result = getEffectivePermissions({ ownerId: undefined, global: false }, 'user-1');
    expect(result).toEqual({ read: false, write: false, admin: false });
  });

  it('owned project, correct userId: grants full access', () => {
    const result = getEffectivePermissions({ ownerId: 'user-1', global: false }, 'user-1');
    expect(result).toEqual({ read: true, write: true, admin: true });
  });

  it('owned project, wrong userId, not global: denies all access', () => {
    const result = getEffectivePermissions({ ownerId: 'user-1', global: false }, 'user-2');
    expect(result).toEqual({ read: false, write: false, admin: false });
  });

  it('global project, non-owner userId: read-only (write and admin denied)', () => {
    const result = getEffectivePermissions({ ownerId: 'user-1', global: true }, 'user-2');
    expect(result).toEqual({ read: true, write: false, admin: false });
  });

  it('global project, owner userId: grants full access', () => {
    const result = getEffectivePermissions({ ownerId: 'user-1', global: true }, 'user-1');
    expect(result).toEqual({ read: true, write: true, admin: true });
  });

  it('unclaimed global project (no ownerId): read-only for any user (global flag still applies)', () => {
    const result = getEffectivePermissions({ ownerId: undefined, global: true }, 'user-1');
    expect(result).toEqual({ read: true, write: false, admin: false });
  });

  it('shared project: user in sharedWith list gets read-only access', () => {
    const result = getEffectivePermissions(
      { ownerId: 'user-1', global: false, sharedWith: ['alice@example.com'] },
      'user-2',
      'alice@example.com',
    );
    expect(result).toEqual({ read: true, write: false, admin: false });
  });

  it('shared project: user NOT in sharedWith list is denied', () => {
    const result = getEffectivePermissions(
      { ownerId: 'user-1', global: false, sharedWith: ['alice@example.com'] },
      'user-2',
      'bob@example.com',
    );
    expect(result).toEqual({ read: false, write: false, admin: false });
  });

  it('shared project: no email provided — sharedWith check is skipped', () => {
    const result = getEffectivePermissions(
      { ownerId: 'user-1', global: false, sharedWith: ['alice@example.com'] },
      'user-2',
    );
    expect(result).toEqual({ read: false, write: false, admin: false });
  });
});
