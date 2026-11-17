import { useCallback, useEffect, useRef, useState } from 'react';
import { TERRAINS } from '../sim/content/terrain';
import type { Overlay } from '../render/mapRenderer';
import type { ChronicleEntry } from '../sim/types';
import type { GroupView } from '../worker/protocol';
import { MapCanvas, type MapHandle } from './MapCanvas';
import { Chronicle, GroupPanel, PersonPanel, WorldPanel } from './panels';
import { ACTIVITY_COLOR, ACTIVITY_LABEL, type Activity } from '../render/people';
import { fmt } from './format';
import { useSim } from './store';

const SAVE_KEY = 'chronicle-of-peoples-save';

function seedFromHash(): number {
  const m = /seed[=-](\d+)/.exec(window.location.hash);
  return m ? Number(m[1]) >>> 0 : Math.floor(Math.random() * 9000) + 1000;
}

export function App() {
  const sim = useSim(() => ({ t: 'new', seed: seedFromHash() }));
  const s = sim.state.current;
  const map = useRef<MapHandle>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('peoples');
  const [hover, setHover] = useState<string>('');
  const [seedInput, setSeedInput] = useState<string>('');
  const [hint, setHint] = useState(true);
  const [auto, setAuto] = useState(true);
  const [personId, setPersonId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const lastSpeed = useRef(10);
  const pendingSave = useRef<'store' | null>(null);

  useEffect(() => {
    sim.send({ t: 'speed', yps: 10 });
    sim.saved.current = (json) => {
      try {
        if (pendingSave.current === 'store') {
          localStorage.setItem(SAVE_KEY, json);
          setNote('Saved in this browser.');
        }
      } catch {
        setNote('Could not save in this browser.');
      }
      pendingSave.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (s.seed) {
      setSeedInput(String(s.seed));
      try { history.replaceState(null, '', `#seed-${s.seed}`); } catch { /* sandboxed */ }
    }
  }, [s.seed]);

  const setSpeed = useCallback((yps: number) => {
    if (yps > 0) lastSpeed.current = yps;
    sim.send({ t: 'speed', yps });
  }, [sim]);

  const newWorld = (seed: number) => {
    setSelected(null);
    sim.send({ t: 'new', seed });
    sim.send({ t: 'speed', yps: lastSpeed.current });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); setSpeed(sim.state.current.yps > 0 ? 0 : lastSpeed.current); }
      else if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(10);
      else if (e.key === '3') setSpeed(100);
      else if (e.key === 'Escape') { setSelected(null); setPersonId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSpeed, sim]);

  const group = s.groups.find((g) => g.id === selected) ?? null;
  const personInfo = personId != null ? map.current?.personInfo(personId) ?? null : null;
  useEffect(() => { if (selected != null && !group && s.groups.length) setSelected(null); }, [group, selected, s.groups.length]);

  const onPick = useCallback((g: GroupView | null) => { setSelected(g ? g.id : null); setHint(false); }, []);
  const onHover = useCallback((tile: number | null, g: GroupView | null) => {
    const st = sim.state.current;
    if (tile == null || !st.map) { setHover(''); return; }
    const t = TERRAINS[st.map.terrain[tile]];
    const bits = [t.name, st.map.river[tile] ? 'river' : '', t.habitable ? `richness ${Math.round(st.map.fert[tile] * 100)}%` : ''].filter(Boolean);
    const who = g ? ` — the ${st.cultures[g.cultureId]?.name} (${fmt(g.pop)})` : '';
    setHover(bits.join(' · ') + who);
  }, [sim]);
  const onEntry = (e: ChronicleEntry) => {
    if (e.tile != null) map.current?.flyTo(e.tile);
    if (e.groupId != null && s.groups.some((g) => g.id === e.groupId)) setSelected(e.groupId);
  };

  const speeds: [string, number][] = [['1×', 1], ['10×', 10], ['100×', 100]];
  const paused = s.yps === 0 && !s.seeking;

  return (
    <div className="app">
      <header className="top">
        <span className="brand">Chronicle of Peoples</span>
        <span className="year" aria-live="off">Year {fmt(s.year)}<small>{s.ended ? 'history ended' : paused ? 'paused' : s.achieved > 0 && s.achieved < s.yps * 0.8 ? `${Math.round(s.achieved)} yr/s` : ''}</small></span>
        <div className="group" role="group" aria-label="Speed">
          <button className={paused ? 'on' : ''} onClick={() => setSpeed(0)} title="Pause (space)">Pause</button>
          {speeds.map(([label, v]) => (
            <button key={v} className={s.yps === v && !s.seeking ? 'on' : ''} onClick={() => setSpeed(v)} title={`${v} years per second`}>{label}</button>
          ))}
          <button className={s.seeking ? 'on' : ''} onClick={() => sim.send({ t: 'seek' })} title="Run flat out until the next major event, then pause">Next big event</button>
        </div>
        <span className="sep" />
        <div className="group">
          <label className="muted" htmlFor="seed">Seed</label>
          <input id="seed" type="number" value={seedInput} min={0} onChange={(e) => setSeedInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') newWorld(Number(seedInput) >>> 0); }} />
          <button className="primary" onClick={() => newWorld(Number(seedInput) >>> 0)}>New world</button>
          <button onClick={() => { const n = Math.floor(Math.random() * 90000) + 1000; setSeedInput(String(n)); newWorld(n); }} title="A random new world">Random</button>
        </div>
        <div className="group">
          <button onClick={() => { pendingSave.current = 'store'; sim.send({ t: 'save' }); }}>Save</button>
          <button onClick={() => {
            try { const j = localStorage.getItem(SAVE_KEY); if (j) { setSelected(null); sim.send({ t: 'load', json: j }); sim.send({ t: 'speed', yps: 0 }); setNote('Loaded, paused.'); } else setNote('Nothing saved yet.'); } catch { setNote('Could not read saved game.'); }
          }}>Load</button>
        </div>
        {note && <span className="muted" role="status">{note}</span>}
      </header>
      <main className="main">
        <section className="mapwrap">
          <MapCanvas ref={map} sim={sim} overlay={overlay} selectedId={selected} onPick={onPick} onHover={onHover} onAutoFrame={setAuto} onPickPerson={setPersonId} />
          <div className="overlay-bar" role="group" aria-label="Map view">
            {([['peoples', 'Peoples'], ['hunger', 'Hunger'], ['farming', 'Farming']] as [Overlay, string][]).map(([k, label]) => (
              <button key={k} className={overlay === k ? 'on' : ''} onClick={() => setOverlay(k)}>{label}</button>
            ))}
            <button className={auto ? 'on' : ''} onClick={() => map.current?.setAutoFrame(!auto)} title="Keep the camera on the peopled lands">Follow</button>
            <button onClick={() => map.current?.fit()} title="Show the whole map">Whole map</button>
          </div>
          {hint && s.year < 400 && (
            <div className="hint">
              Two people begin in the green heartland. Watch them grow, split and spread. The small dots are individual people: click one to see what they are doing and why. Click a larger marker to follow a whole people; scroll to zoom, drag to pan.
              <br /><button onClick={() => setHint(false)}>Got it</button>
            </div>
          )}
          {s.ended && <div className="banner"><b>Everyone is gone.</b> Pick a new seed to try again.</div>}
          {s.error && <div className="banner">Something went wrong: {s.error}</div>}
          {hover && <div className="hover-info">{hover}</div>}
          <details className="legend">
            <summary>Legend</summary>
            <div><span className="sw band" /> Band (under 30)</div>
            <div><span className="sw" /> Tribe</div>
            <div><span className="sw village" /> Village (farms)</div>
            <div className="muted">Similar colours are kin</div>
            <div className="muted" style={{ marginTop: 2 }}>People (click one):</div>
            <div className="acts">
              {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (
                <span key={a}><i className="dot" style={{ background: ACTIVITY_COLOR[a] }} />{ACTIVITY_LABEL[a]}</span>
              ))}
            </div>
          </details>
        </section>
        <aside className="side">
          <div className="inspect">
            {personInfo && <PersonPanel person={personInfo.person} group={personInfo.group} sample={personInfo.sample} state={s} onClose={() => setPersonId(null)} />}
            {group ? <GroupPanel g={group} state={s} onClose={() => { setSelected(null); setPersonId(null); }} /> : <WorldPanel state={s} />}
          </div>
          <Chronicle entries={s.chronicle} onPick={onEntry} />
        </aside>
      </main>
    </div>
  );
}
