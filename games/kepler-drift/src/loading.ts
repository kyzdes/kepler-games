export interface LoadingProgress { percent: number; stage: 0 | 1 | 2 | 3; label: string; }

/** Let the browser paint the loader before the next chunk of scene construction. */
export function paintLoadingFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export class LoadingScreen {
  private readonly element = document.getElementById('loading')!;
  private readonly progress = document.getElementById('loading-progress')!;
  private readonly fill = document.getElementById('loading-fill')!;
  private readonly value = document.getElementById('loading-percent')!;
  private readonly status = document.getElementById('loading-status')!;
  private readonly steps = [...this.element.querySelectorAll('.loading-stages li')];
  private startedAt = performance.now();
  private percent = 0;

  async prepare(): Promise<void> {
    const art = document.getElementById('loading-art') as HTMLImageElement;
    // A missing decorative image must not prevent the real game from starting.
    await Promise.allSettled([art.decode(), document.fonts.load('400 16px Exo')]);
    this.startedAt = performance.now();
    await paintLoadingFrame();
  }

  update = ({ percent, stage, label }: LoadingProgress): void => {
    this.percent = Math.max(this.percent, Math.min(100, Math.round(percent)));
    this.fill.style.transform = `scaleX(${this.percent / 100})`;
    this.value.textContent = String(this.percent);
    this.progress.setAttribute('aria-valuenow', String(this.percent));
    this.progress.setAttribute('aria-valuetext', `${this.percent}% — ${label}`);
    if (this.status.textContent !== label) this.status.textContent = label;
    this.steps.forEach((step, i) => {
      step.classList.toggle('active', i === stage);
      step.classList.toggle('complete', i < stage || percent === 100);
      if (i === stage) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
  };

  async finish(): Promise<void> {
    this.update({ percent:100, stage:3, label:'Всё готово. Добро пожаловать на борт.' });
    this.element.dataset.state = 'ready';
    this.element.setAttribute('aria-busy', 'false');
    // Avoid a one-frame flash on warm starts; the bar already reports ready.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (performance.now() - this.startedAt))));
    await paintLoadingFrame();
    this.element.classList.add('leaving');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 620));
    this.element.hidden = true;
    document.getElementById('app')!.inert = false;
    document.getElementById('launch-button')?.focus({ preventScroll:true });
  }

  fail(): void {
    this.element.dataset.state = 'error';
    this.element.setAttribute('aria-busy', 'false');
    this.status.textContent = 'Не удалось подготовить экспедицию';
    this.progress.setAttribute('aria-valuetext', 'Подготовка прервана');
    const message = document.getElementById('loading-error')!;
    message.textContent = 'Попробуйте обновить страницу. Для полёта нужен браузер с WebGL 2 и включённым аппаратным ускорением.';
    message.hidden = false;
    const retry = document.getElementById('retry-loading')!;
    retry.hidden = false;
    retry.onclick = () => location.reload();
    retry.focus({ preventScroll:true });
  }
}
