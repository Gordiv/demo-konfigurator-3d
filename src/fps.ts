import type { Stage } from './scene';

declare global {
  interface Window {
    measureStage?: (frames?: number, pixelRatio?: number) => number;
  }
}

/** Frame-time readout enabled with `?fps` in the URL. */
export function installFrameMeter(stage: Stage): void {
  const meter = document.createElement('div');
  meter.className = 'fps-meter';
  meter.setAttribute('aria-hidden', 'true');
  document.body.append(meter);

  let last = 0;
  let average = 16.7;
  const loop = (time: number) => {
    if (last) average += (time - last - average) * 0.05;
    last = time;
    meter.textContent = `${average.toFixed(1)} ms · ${(1000 / average).toFixed(0)} fps · DPR ${stage.pixelRatio()}`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  window.measureStage = (frames = 120, pixelRatio?: number) => stage.measure(frames, pixelRatio);
}
