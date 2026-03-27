import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.resolve('coverage/coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('coverage-summary.json not found. Run coverage first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

const requiredGlobalBranchPct = 80;
const requiredCriticalBranchPct = 80;
const criticalFiles = [
  'src/store/useWorkoutStore.ts',
  'src/App.tsx',
  'src/utils/timerWorker.ts',
  'src/utils/savedWorkouts.ts',
];

const globalBranches = summary.total?.branches?.pct ?? 0;
if (globalBranches < requiredGlobalBranchPct) {
  console.error(`Global branch coverage ${globalBranches}% is below ${requiredGlobalBranchPct}%.`);
  process.exit(1);
}

const getEntryForFile = (target) => {
  const normalizedTarget = target.replace(/\\/g, '/');
  return Object.entries(summary).find(([key]) => key.replace(/\\/g, '/').endsWith(normalizedTarget));
};

for (const file of criticalFiles) {
  const entry = getEntryForFile(file);
  if (!entry) {
    console.error(`Coverage entry missing for critical file: ${file}`);
    process.exit(1);
  }

  const [, metrics] = entry;
  const branchPct = metrics?.branches?.pct ?? 0;
  if (branchPct < requiredCriticalBranchPct) {
    console.error(`Branch coverage for ${file} is ${branchPct}% (required ${requiredCriticalBranchPct}%).`);
    process.exit(1);
  }
}

console.log('Coverage thresholds satisfied (global + critical files).');

