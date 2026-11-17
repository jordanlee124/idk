import { SimRunner } from './runner';
import type { FromSim, ToSim } from './protocol';

const ctx = self as unknown as { postMessage(m: FromSim): void; onmessage: ((e: MessageEvent<ToSim>) => void) | null };
const runner = new SimRunner((m) => ctx.postMessage(m), () => performance.now(), 45);
ctx.onmessage = (e) => runner.handle(e.data);
setInterval(() => runner.pump(), 30);
