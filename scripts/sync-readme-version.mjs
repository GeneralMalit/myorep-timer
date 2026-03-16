import fs from 'node:fs';

const packageJsonPath = new URL('../package.json', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = pkg.version;

let readme = fs.readFileSync(readmePath, 'utf8');

readme = readme.replace(/^# Myo-Rep v[^\r\n]*/m, `# Myo-Rep v${version}`);
readme = readme.replace(/\*\*Current Version:\s*[^*\r\n]+\*\*/m, `**Current Version: ${version}**`);

fs.writeFileSync(readmePath, readme, 'utf8');
