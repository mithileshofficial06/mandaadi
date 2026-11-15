// Run the Devvit CLI with Mandaadi's own login (~/.devvit-mandaadi, u/kira_-_06),
// so it never touches the default ~/.devvit login used by other projects.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['devvit', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEVVIT_DIR_NAME: '.devvit-mandaadi' },
});
process.exit(r.status ?? 1);
