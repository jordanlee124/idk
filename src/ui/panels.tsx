import { useMemo, useState } from 'react';
import { TECHS, TECH_BY_ID } from '../sim/content/techs';
import { STAGES } from '../sim/content/stages';
import { TRAIT_BLURB } from '../sim/content/names';
import type { ChronicleEntry, Culture, StatPoint } from '../sim/types';
import type { GroupView } from '../worker/protocol';
import { ACTIVITY_COLOR, ACTIVITY_LABEL, type Person } from '../render/people';
import { fmt, foodWord, stageLabel } from './format';
import type { SimState } from './store';

export function Chronicle({ entries, onPick }: { entries: ChronicleEntry[]; onPick: (e: ChronicleEntry) => void }) {
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const shown = useMemo(() => {
    const out: ChronicleEntry[] = [];
    for (let i = entries.length - 1; i >= 0 && out.length < 150; i--) if (entries[i].importance >= level) out.push(entries[i]);
    return out;
  }, [entries, level]);
  return (
    <section className="chron" aria-label="Chronicle">
      <div className="chron-head">
        <h2>Chronicle</h2>
        {([3, 2, 1] as const).map((l) => (
          <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)} title={l === 3 ? 'Turning points only' : l === 2 ? 'Notable events' : 'Everything, including small detail'}>
            {l === 3 ? 'Major' : l === 2 ? 'Notable' : 'All'}
          </button>
        ))}
      </div>
      <div className="chron-list">
        {shown.length === 0 && <div className="empty">Nothing recorded yet.</div>}
        {shown.map((e) => (
          <div key={e.id} className={`entry m${e.importance}`} onClick={() => onPick(e)} title={e.tile != null ? 'Click to look at the place' : undefined}>
            <span className="y">{e.year}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function lineage(c: Culture | undefined, cultures: Culture[]): string[] {
  const out: string[] = [];
  let cur = c;
  for (let i = 0; cur && i < 6; i++) {
    out.push(cur.name);
    cur = cur.parent != null ? cultures[cur.parent] : undefined;
  }
  return out;
}

export function GroupPanel({ g, state, onClose }: { g: GroupView; state: SimState; onClose: () => void }) {
  const culture = state.cultures[g.cultureId];
  const food = foodWord(g.foodRatio);
  const line = lineage(culture, state.cultures);
  const known = new Set(g.techs);
  const next = TECHS.filter((t) => !known.has(t.id) && t.requires.every((r) => known.has(r)));
  const foodPct = Math.min(100, Math.max(4, (g.foodRatio / 1.4) * 100));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3>
          The {culture?.name ?? 'people'}
          <span className="badge">{stageLabel[g.stage]}</span>
        </h3>
        <button onClick={onClose} aria-label="Close" style={{ minHeight: 26, padding: '0 8px' }}>×</button>
      </div>
      {g.placeName && <div className="muted">Village of {g.placeName}</div>}
      <dl className="kv">
        <dt>People</dt>
        <dd>
          <b>{fmt(g.pop)}</b> <span className="muted">(land feeds about {fmt(g.capacity)})</span>
        </dd>
        <dt>Food</dt>
        <dd>
          <div className={`bar ${food.level}`} aria-label={`Food ${food.word}`}>
            <i style={{ width: `${foodPct}%` }} />
          </div>
          <span className="muted">{food.word}{g.famine > 0 ? ` · ${g.famine} hungry year${g.famine > 1 ? 's' : ''}` : ''}</span>
        </dd>
        {g.leaderName && (<><dt>Led by</dt><dd>{g.leaderName}</dd></>)}
        <dt>Founded</dt>
        <dd>
          Year {g.founded}
          {g.stage !== 'village' && g.techs.includes('agriculture') && g.sedentary < STAGES.villageSedentaryYears ? <span className="muted"> · settling down: {g.sedentary}/{STAGES.villageSedentaryYears} yrs</span> : null}
        </dd>
        <dt>Kin</dt>
        <dd>{line.length > 1 ? line.join(' ← ') : 'Original people'}</dd>
        {culture && (
          <>
            <dt>Traits</dt>
            <dd>{culture.traits.map((t) => (<span key={t} title={TRAIT_BLURB[t]} style={{ marginRight: 8 }}>{t}</span>))}</dd>
          </>
        )}
      </dl>
      <div className="muted">Knows ({g.techs.length}/{TECHS.length})</div>
      <div className="techs">
        {TECHS.filter((t) => known.has(t.id)).map((t) => (<span key={t.id} className="tech k" title={t.blurb}>{t.name}</span>))}
      </div>
      {next.length > 0 && (
        <>
          <div className="muted">Could discover next</div>
          <div className="techs">{next.map((t) => (<span key={t.id} className="tech n" title={t.blurb}>{t.name}</span>))}</div>
        </>
      )}
    </div>
  );
}

function Spark({ stats, pick, color, max }: { stats: StatPoint[]; pick: (s: StatPoint) => number; color: string; max: number }) {
  if (stats.length < 2) return null;
  const x0 = stats[0].year;
  const x1 = stats[stats.length - 1].year;
  const pts = stats.map((s) => `${(((s.year - x0) / Math.max(1, x1 - x0)) * 300).toFixed(1)},${(78 - (pick(s) / Math.max(1, max)) * 72).toFixed(1)}`).join(' ');
  return <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
}

export function WorldPanel({ state }: { state: SimState }) {
  const { groups, stats, techCoverage } = state;
  const pop = groups.reduce((a, g) => a + g.pop, 0);
  const counts = { band: 0, tribe: 0, village: 0 };
  for (const g of groups) counts[g.stage]++;
  const maxPop = Math.max(10, ...stats.map((s) => s.pop));
  const maxGroups = Math.max(5, ...stats.map((s) => s.groups));
  const eraText = state.era === 'dry' ? 'A cold, dry age' : state.era === 'wet' ? 'A warm, wet age' : 'Ordinary seasons';
  return (
    <div>
      <h3>The world</h3>
      <dl className="kv">
        <dt>People</dt>
        <dd><b>{fmt(pop)}</b> in {groups.length} group{groups.length === 1 ? '' : 's'}</dd>
        <dt>Stages</dt>
        <dd>{counts.band} bands · {counts.tribe} tribes · {counts.village} villages</dd>
        <dt>Climate</dt>
        <dd>{eraText}</dd>
      </dl>
      <div className="muted" style={{ marginTop: 6 }}>People <span style={{ color: 'var(--accent)' }}>■</span> and peoples <span style={{ color: 'var(--good)' }}>■</span> over time</div>
      <svg className="chart" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Population and number of peoples over time">
        <line x1="0" y1="78" x2="300" y2="78" stroke="var(--line)" />
        <Spark stats={stats} pick={(s) => s.pop} color="var(--accent)" max={maxPop} />
        <Spark stats={stats} pick={(s) => s.groups} color="var(--good)" max={maxGroups} />
      </svg>
      <div className="muted">How far each discovery has spread</div>
      {TECHS.map((t) => {
        const n = techCoverage[t.id] ?? 0;
        const pct = groups.length ? (n / groups.length) * 100 : 0;
        return (
          <div className="cov" key={t.id} title={TECH_BY_ID[t.id].blurb}>
            <span>{t.name}</span>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="muted">{Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function PersonPanel({ person, group, sample, state, onClose }: { person: Person; group: GroupView; sample: number; state: SimState; onClose: () => void }) {
  const culture = state.cultures[group.cultureId];
  return (
    <div className="person">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3>
          {person.name}
          {person.founder ? <span className="badge">Founder</span> : null}
        </h3>
        <button onClick={onClose} aria-label="Close person" style={{ minHeight: 26, padding: '0 8px' }}>×</button>
      </div>
      <div className="muted">of the {culture?.name ?? 'people'}</div>
      <div className="now">
        <span className="dot" style={{ background: ACTIVITY_COLOR[person.activity] }} />
        <b>{ACTIVITY_LABEL[person.activity]}</b>
        {person.where ? <span className="muted"> · at {person.where}</span> : null}
      </div>
      <p className="why"><b>Why:</b> {person.why || 'Deciding what to do next.'}</p>
      <p className="muted small">One of {sample} people shown for this group of {fmt(group.pop)}. Their choices come from the group's real food, crowding and know-how; the exact spot they pick is just for show.</p>
    </div>
  );
}
