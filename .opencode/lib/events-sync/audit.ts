// データ整合性監査。events 側は受動（read.mjs で読み出すだけ）に保ち、
// 能動的な違反判定は opencode/lib 側の責務とする。
// 渡された meta オブジェクトに、ready/commit なのに path を持たない
// コンポーネントを検出して、既に整形済みの英語メッセージを返す
export interface AuditFinding {
  key: string;
  message: string;
}

// ready/commit のコンポーネントは path を持つべき（agenda で Files を確定するため）
const PATH_STATUSES = new Set(['ready', 'commit']);

type Component = { purpose?: unknown; status?: unknown; path?: unknown };

const toMessage = (key: string, status: string): string =>
  `meta component ${key} is "${status}" but has no path; set it per the agreed agenda files`;

export const auditMeta = (meta: unknown): AuditFinding[] => {
  if (!meta || typeof meta !== 'object') return [];
  const findings: AuditFinding[] = [];
  for (const [section, comps] of Object.entries(meta)) {
    if (!comps || typeof comps !== 'object') continue;
    for (const [id, node] of Object.entries(comps)) {
      if (!node || typeof node !== 'object' || !('purpose' in node)) continue;
      const component = node as Component;
      const status = typeof component.status === 'string' ? component.status : '';
      if (PATH_STATUSES.has(status) && typeof component.path !== 'string')
        findings.push({
          key: `meta.${section}.${id}`,
          message: toMessage(`meta.${section}.${id}`, status),
        });
    }
  }
  return findings;
};
