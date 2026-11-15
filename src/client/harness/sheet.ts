// Harness only: every daily course's chart on one page, for reviewing the 30-day cycle.
import { DAILY, PARS, SCHOOL } from '../../shared/content/school';
import { drawChart } from '../race/chart';

const which = new URLSearchParams(location.search).get('set') === 'school' ? SCHOOL.flatMap((s) => s.levels) : DAILY;
const grid = document.getElementById('grid')!;
for (const c of which) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const cv = document.createElement('canvas');
  cell.append(cv);
  const p = document.createElement('p');
  p.innerHTML = `${c.id} · ${c.name}<br><small>${c.type} · ${c.marks.length} mark${c.marks.length > 1 ? 's' : ''} · par ${((PARS[c.id] ?? 0) / 30).toFixed(0)} s</small>`;
  cell.append(p);
  grid.append(cell);
  requestAnimationFrame(() => drawChart(cv, c));
}
