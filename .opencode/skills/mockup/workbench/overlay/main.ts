// モックアップオーバーレイのエントリ。dev時のみ注入され、成果物には含まれない
import { initHighlight } from './highlight';
import { initInspector, type AnnotationDraft } from './inspector';

const postJSON = async (path: string, body: unknown): Promise<void> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`request failed: ${path} (${res.status})`);
};

initHighlight();
initInspector({
  postInstruction: (draft: AnnotationDraft) => postJSON('/__annotations', draft),
  postNotify: () => postJSON('/__notify', {}),
});
