import fs from 'fs';
import path from 'path';

const pwaDistPath = path.resolve(import.meta.dirname, 'node_modules/vite-plugin-pwa/dist/index.js');
if (fs.existsSync(pwaDistPath)) {
  let content = fs.readFileSync(pwaDistPath, 'utf8');
  if (content.includes('var _dirname = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));')) {
    content = content.replace(
      'var _dirname = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));',
      'var _dirname = (typeof __dirname !== "undefined" && __dirname !== ".") ? __dirname : dirname(fileURLToPath(import.meta.url));'
    );
    fs.writeFileSync(pwaDistPath, content, 'utf8');
  }
}
