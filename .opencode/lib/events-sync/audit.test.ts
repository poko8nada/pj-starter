// データ整合性監査（auditMeta）のテスト。ready/commit は path 必須、planned は任意
import { describe, expect, it } from 'vitest';
import { auditMeta } from './audit';

describe('auditMeta', () => {
  it('flags ready/commit components without a path', () => {
    const meta = {
      skills: {
        recon: { purpose: 'survey', status: 'ready' },
        audit: { purpose: 'review', status: 'commit' },
      },
    };
    const findings = auditMeta(meta);
    expect(findings.map((f) => f.key)).toEqual(['meta.skills.recon', 'meta.skills.audit']);
  });

  it('ignores non-component leaves', () => {
    const meta = { docs: { plain: { note: 'not a component' } } };
    expect(auditMeta(meta)).toEqual([]);
  });

  it('accepts ready/commit with a real path', () => {
    const meta = {
      skills: {
        agenda: { purpose: 'p', status: 'commit', path: 'a.md' },
        recon: { purpose: 'p', status: 'ready', path: 'b.md' },
      },
    };
    expect(auditMeta(meta)).toEqual([]);
  });

  it('produces English agent-facing messages', () => {
    const findings = auditMeta({ skills: { x: { purpose: 'p', status: 'ready' } } });
    expect(findings[0].message).toMatch(/has no path/);
  });
});
