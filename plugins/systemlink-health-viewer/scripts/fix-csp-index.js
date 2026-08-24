const fs = require('fs');
const path = require('path');
const distIndex = path.join(__dirname, '..', 'dist', 'systemlink-health-viewer', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.error(`Cannot find dist index at ${distIndex}`);
  process.exit(1);
}

let html = fs.readFileSync(distIndex, 'utf8');
const injectedLinkRegex = /<link rel="stylesheet" href="styles\.css" media="print" onload="this\.media='all'">\s*<noscript><link rel="stylesheet" href="styles\.css"><\/noscript>/;
const replacement = '<link rel="stylesheet" href="styles.css">';

if (!injectedLinkRegex.test(html)) {
  console.warn('No injected stylesheet loader found. No changes made.');
  process.exit(0);
}

html = html.replace(injectedLinkRegex, replacement);
fs.writeFileSync(distIndex, html, 'utf8');
console.log('CSP-safe stylesheet link applied to dist/index.html');
