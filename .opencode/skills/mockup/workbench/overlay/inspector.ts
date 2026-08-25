// クリックしたコンポーネントへの指示を書くエディタ。
// 送信はJSONLへの記録のみ。通知ボタンがエージェントの起床トリガー
export interface AnnotationDraft {
  target: string;
  text: string;
}

export interface InspectorHandlers {
  postInstruction: (draft: AnnotationDraft) => Promise<void>;
  postNotify: () => Promise<void>;
}

const PANEL_CSS = [
  'position:fixed',
  'right:16px',
  'bottom:16px',
  'z-index:2147483647',
  'width:280px',
  'background:#fff',
  'border:1px solid #cbd5e1',
  'border-radius:8px',
  'box-shadow:0 8px 24px rgb(0 0 0 / 0.15)',
  'padding:12px',
  'font:13px/1.5 system-ui,sans-serif',
  'color:#0f172a',
].join(';');

const buildPanel = (): {
  panel: HTMLDivElement;
  targetView: HTMLElement;
  textarea: HTMLTextAreaElement;
  submit: HTMLButtonElement;
  notify: HTMLButtonElement;
  status: HTMLElement;
} => {
  const panel = document.createElement('div');
  panel.id = 'mockup-overlay-inspector';
  panel.style.cssText = PANEL_CSS;

  const title = document.createElement('div');
  title.textContent = 'エージェントへの指示';
  title.style.cssText = 'font-weight:700;margin-bottom:4px';

  const targetView = document.createElement('code');
  targetView.style.cssText =
    'display:block;background:#f1f5f9;border-radius:4px;padding:2px 6px;margin-bottom:6px;color:#0369a1';

  const textarea = document.createElement('textarea');
  textarea.placeholder = '例: このボタンをもっと丸くして';
  textarea.rows = 3;
  textarea.style.cssText =
    'width:100%;box-sizing:border-box;resize:vertical;border:1px solid #cbd5e1;border-radius:4px;padding:6px;font:inherit';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px';

  const submit = document.createElement('button');
  submit.textContent = '送信';
  submit.title = '指示を記録する（エージェントはまだ起きない）';
  submit.style.cssText =
    'background:#0ea5e9;color:#fff;border:0;border-radius:4px;padding:4px 14px;font-weight:700;cursor:pointer';

  const notify = document.createElement('button');
  notify.appendChild(document.createElement('iconify-icon')).setAttribute('icon', 'lucide:bell');
  notify.appendChild(document.createTextNode('通知'));
  notify.title = '未解決の指示とともにエージェントを起こす';
  notify.style.cssText =
    'display:inline-flex;align-items:center;gap:4px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:4px;padding:3px 10px;font-weight:700;cursor:pointer';

  const status = document.createElement('span');
  status.style.cssText = 'color:#64748b';

  actions.append(submit, notify, status);
  panel.append(title, targetView, textarea, actions);
  document.body.append(panel);
  return { panel, targetView, textarea, submit, notify, status };
};

export const initInspector = (handlers: InspectorHandlers): void => {
  let currentTarget = '';
  const ui = buildPanel();
  ui.panel.style.display = 'none';

  const showStatus = (text: string): void => {
    ui.status.textContent = text;
    setTimeout(() => {
      ui.status.textContent = '';
    }, 2000);
  };

  const sendInstruction = async (): Promise<void> => {
    const text = ui.textarea.value.trim();
    if (text === '') return;
    ui.submit.disabled = true;
    try {
      await handlers.postInstruction({ target: currentTarget, text });
      ui.textarea.value = '';
      showStatus('送信しました');
    } catch {
      showStatus('送信に失敗しました');
    } finally {
      ui.submit.disabled = false;
    }
  };

  const sendNotify = async (): Promise<void> => {
    ui.notify.disabled = true;
    try {
      await handlers.postNotify();
      showStatus('エージェントに通知しました');
    } catch {
      showStatus('通知に失敗しました');
    } finally {
      ui.notify.disabled = false;
    }
  };

  document.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest?.('[data-mock]');
    if (!hit) return;
    event.preventDefault();
    currentTarget = hit.getAttribute('data-mock') ?? '';
    ui.targetView.textContent = currentTarget;
    ui.panel.style.display = 'block';
    ui.textarea.focus();
  });

  ui.submit.addEventListener('click', () => void sendInstruction());
  ui.notify.addEventListener('click', () => void sendNotify());
  ui.textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void sendInstruction();
  });
};
