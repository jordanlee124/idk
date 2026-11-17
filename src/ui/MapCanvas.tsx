import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { MapRenderer, type Overlay } from '../render/mapRenderer';
import type { GroupView } from '../worker/protocol';
import type { SimApi } from './store';

export interface MapHandle {
  flyTo(tile: number): void;
  fit(): void;
  setAutoFrame(on: boolean): void;
}

interface Props {
  sim: SimApi;
  overlay: Overlay;
  selectedId: number | null;
  onPick: (g: GroupView | null, tile: number | null) => void;
  onHover: (tile: number | null, g: GroupView | null) => void;
  onAutoFrame: (on: boolean) => void;
}

export const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas({ sim, overlay, selectedId, onPick, onHover, onAutoFrame }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<MapRenderer | null>(null);
  const picks = useRef({ onPick, onHover, onAutoFrame });
  picks.current = { onPick, onHover, onAutoFrame };

  useImperativeHandle(ref, () => ({
    flyTo: (tile) => view.current?.flyToTile(tile),
    fit: () => {
      view.current?.setAutoFrame(false);
      view.current?.fit();
    },
    setAutoFrame: (on) => view.current?.setAutoFrame(on),
  }));

  useEffect(() => {
    const r = new MapRenderer(canvas.current!);
    view.current = r;
    r.onPick = (g, t) => picks.current.onPick(g, t);
    r.onHover = (t, g) => picks.current.onHover(t, g);
    r.onAutoFrameChange = (on) => picks.current.onAutoFrame(on);
    const ro = new ResizeObserver(() => {
      const el = wrap.current!;
      r.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(wrap.current!);
    const sync = () => {
      const s = sim.state.current;
      if (s.map && s.map !== (r as unknown as { map: unknown }).map) {
        r.setMap(s.map);
        r.setAutoFrame(true);
      }
      r.groups = s.groups;
      r.cultures = s.cultures;
      r.droughts = s.droughts;
      r.year = s.year;
      r.updateAutoFrame();
      r.requestDraw();
    };
    sync();
    const off = sim.listen(() => sync());
    return () => {
      off();
      ro.disconnect();
      r.dispose();
    };
  }, [sim]);

  useEffect(() => {
    if (!view.current) return;
    view.current.overlay = overlay;
    view.current.selectedId = selectedId;
    view.current.requestDraw();
  }, [overlay, selectedId]);

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvas} aria-label="Map of the world and its peoples" />
    </div>
  );
});
