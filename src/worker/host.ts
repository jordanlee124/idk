// Starts the simulation in a Web Worker; if workers are unavailable (some sandboxes, file:// pages), runs it on the page instead.
import SimWorker from './sim.worker?worker&inline';
import { SimRunner } from './runner';
import type { FromSim, ToSim } from './protocol';

export interface SimHost {
  send(msg: ToSim): void;
  mode: 'worker' | 'inline';
  dispose(): void;
}

/** `onFail` is called if the worker cannot start or crashes, so the caller can switch to the inline runner. */
export function startSim(onMessage: (m: FromSim) => void, onFail: () => void): SimHost {
  try {
    const worker: Worker = new SimWorker();
    worker.onmessage = (e: MessageEvent<FromSim>) => onMessage(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      onFail();
    };
    return { mode: 'worker', send: (m) => worker.postMessage(m), dispose: () => worker.terminate() };
  } catch {
    onFail();
    return { mode: 'worker', send: () => {}, dispose: () => {} };
  }
}

export function startInline(onMessage: (m: FromSim) => void): SimHost {
  const runner = new SimRunner(onMessage, () => performance.now(), 22);
  const timer = setInterval(() => runner.pump(), 33);
  return { mode: 'inline', send: (m) => runner.handle(m), dispose: () => clearInterval(timer) };
}
