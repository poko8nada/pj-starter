// データ整合性監査（auditMeta）のテスト。
// ready/implement/commit は path 必須、planned は任意
import { describe, expect, it } from 'vitest';
import { auditMeta } from './audit';

describe('auditMeta', () => {
  it('flags components in progress without a path', () => {
    const meta = {
      skills: {
        recon: { purpose: 'survey', status: { stage: 'ready', text: 'x' } },
        audit: { purpose: 'review', status: { stage: 'commit', text: 'x' } },
        mockup: { purpose: 'mock', status: { stage: 'implement', text: 'x' } },
      },
    };
    const findings = auditMeta(meta);
    expect(findings.map((f) => f.key)).toEqual([
      'meta.skills.recon',
      'meta.skills.audit',
      'meta.skills.mockup',
    ]);
  });

  it('ignores non-component leaves and planned components', () => {
    const meta = {
      docs: {
        plain: { note: 'not a component' },
        recon: { purpose: 'p', status: { stage: 'planned', text: 'x' } },
      },
    };
    expect(auditMeta(meta)).toEqual([]);
  });

  it('accepts in-progress components with a real path', () => {
    const meta = {
      skills: {
        agenda: { purpose: 'p', path: 'a.md', status: { stage: 'commit', text: 'x' } },
        recon: { purpose: 'p', path: 'b.md', status: { stage: 'implement', text: 'x' } },
      },
    };
    expect(auditMeta(meta)).toEqual([]);
  });

  it('reads the stage from the nested status object', () => {
    const findings = auditMeta({
      skills: { x: { purpose: 'p', status: { stage: 'ready', text: 'x' } } },
    });
    expect(findings[0].message).toMatch(/is "ready".*has no path/);
  });

  it('produces English agent-facing messages', () => {
    const findings = auditMeta({
      skills: { x: { purpose: 'p', status: { stage: 'ready', text: 'x' } } },
    });
    expect(findings[0].message).toMatch(/has no path/);
  });
});
