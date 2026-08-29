// パス判定ユーティリティのテスト
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isOutsideRoot } from './path';

describe('isOutsideRoot', () => {
  it('returns false for paths inside the root', () => {
    expect(isOutsideRoot('/project', '/project/src/file.ts')).toBe(false);
    expect(isOutsideRoot('/project', 'src/file.ts')).toBe(false);
    expect(isOutsideRoot('/project', '/project')).toBe(false);
    expect(isOutsideRoot('/project', '/project/..foo')).toBe(false);
  });

  it('returns true for paths outside the root', () => {
    expect(isOutsideRoot('/project', '/outside/file.ts')).toBe(true);
    expect(isOutsideRoot('/project', '/project-other/file.ts')).toBe(true);
    expect(isOutsideRoot('/project', '../outside/file.ts')).toBe(true);
  });

  it('expands tilde paths against the home directory', () => {
    expect(isOutsideRoot('/project', '~/outside/file.ts')).toBe(true);
    expect(isOutsideRoot(join(homedir(), 'project'), '~')).toBe(true);
    expect(isOutsideRoot(dirname(homedir()), '~/x')).toBe(false);
  });

  it('does not expand ~user paths (documented exclusion)', () => {
    expect(isOutsideRoot('/project', '~user/file.ts')).toBe(false);
  });

  it('treats non-string and empty paths as inside the root', () => {
    expect(isOutsideRoot('/project', undefined)).toBe(false);
    expect(isOutsideRoot('/project', '')).toBe(false);
    expect(isOutsideRoot('/project', 42)).toBe(false);
    expect(isOutsideRoot('/project', {})).toBe(false);
    expect(isOutsideRoot(undefined, '/outside/file.ts')).toBe(false);
  });
});
