// Print each course's Harbourmaster par time (target 50-80 s).
import { COURSES } from '../src/shared/content/courses';
import { parTicks } from '../src/shared/core/par';
for (const c of COURSES) console.log(c.id, c.name.padEnd(16), (parTicks(c) / 30).toFixed(1), 's', 'marks', c.marks.length, 'wind', c.wind.strength);
