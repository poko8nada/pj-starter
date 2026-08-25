// data-mock 属性要素のホバー強調。IDラベルとアウトラインを表示する
let label: HTMLDivElement | null = null;

const showLabel = (el: Element): void => {
  if (!label) {
    label = document.createElement('div');
    label.id = 'mockup-overlay-label';
    label.style.cssText = [
      'position:absolute',
      'z-index:2147483647',
      'background:#0ea5e9',
      'color:#fff',
      'font:600 11px/1.4 system-ui,sans-serif',
      'padding:1px 6px',
      'border-radius:3px',
      'pointer-events:none',
      'white-space:nowrap',
    ].join(';');
    document.body.append(label);
  }
  const rect = el.getBoundingClientRect();
  label.textContent = el.getAttribute('data-mock') ?? '';
  label.style.left = `${Math.max(rect.left + window.scrollX, 0)}px`;
  label.style.top = `${Math.max(rect.top + window.scrollY - 18, 0)}px`;
  label.style.display = 'block';
};

const hideLabel = (): void => {
  if (label) label.style.display = 'none';
};

export const initHighlight = (): void => {
  const style = document.createElement('style');
  style.textContent =
    '[data-mock]{cursor:pointer}[data-mock]:hover{outline:2px solid #0ea5e9;outline-offset:-2px}';
  document.head.append(style);
  document.addEventListener('mouseover', (event) => {
    const target = (event.target as Element | null)?.closest?.('[data-mock]');
    if (target) showLabel(target);
  });
  document.addEventListener('mouseout', hideLabel);
};
