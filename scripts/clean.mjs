import fs from 'fs';
import path from 'path';

const targets = ['dist', 'server.js', 'api/index.js.map'];

for (const target of targets) {
  const fullPath = path.resolve(process.cwd(), target);
  try {
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.warn(`[Clean] Não foi possível remover ${target}:`, err);
  }
}
