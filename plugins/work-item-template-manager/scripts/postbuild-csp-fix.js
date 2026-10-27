const fs = require('fs');
const path = require('path');

const indexPath = path.join(
  'dist',
  'work-item-template-manager',
  'browser',
  'index.html',
);

let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/<base href="[^"]*">\s*/i, '');
html = html.replace(/ media="print" onload="this.media='all'"/g, '');
html = html.replace(' data-beasties-container', '');

fs.writeFileSync(indexPath, html);
