// 圓環進度（靜態：維持倒數；動態：完成次數）
const NS = 'http://www.w3.org/2000/svg';
const R = 52;
const CIRCUMFERENCE = 2 * Math.PI * R;

export class ProgressRing {
  readonly element: HTMLDivElement;
  private readonly bar: SVGCircleElement;
  private readonly value: HTMLSpanElement;
  private readonly unit: HTMLSpanElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'pr-ring';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    const track = document.createElementNS(NS, 'circle');
    this.bar = document.createElementNS(NS, 'circle');
    for (const c of [track, this.bar]) {
      c.setAttribute('cx', '60');
      c.setAttribute('cy', '60');
      c.setAttribute('r', String(R));
      svg.append(c);
    }
    track.setAttribute('class', 'track');
    this.bar.setAttribute('class', 'bar');
    this.bar.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    const text = document.createElement('div');
    text.className = 'pr-ring-text';
    this.value = document.createElement('span');
    this.unit = document.createElement('small');
    text.append(this.value, this.unit);
    this.element.append(svg, text);
    this.set(0, '', '');
  }

  /** @param progress 0～1 */
  set(progress: number, value: string, unit: string): void {
    const p = Math.min(Math.max(progress, 0), 1);
    this.bar.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - p)));
    this.value.textContent = value;
    this.unit.textContent = unit;
  }
}
