const fs = require('fs');
const path = require('path');
const { C, log, warn, err, humanSize, parseSelection } = require('./utils');

const SKIP_DIRS = ['.git', '.vscode', '.cache', 'node_modules'];

function listFilesRecursive(dir, extensions = null, baseDir = dir, depth = 0) {
  let results = [];
  if (depth > 10) return results;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const d of files) {
      if (d.name.startsWith('.')) continue;
      const fullPath = path.join(dir, d.name);
      const relPath = path.relative(baseDir, fullPath);
      
      if (d.isDirectory()) {
        if (SKIP_DIRS.includes(d.name)) continue;
        results = results.concat(listFilesRecursive(fullPath, extensions, baseDir, depth + 1));
      } else if (d.isFile()) {
        let match = true;
        if (extensions) {
          const exts = Array.isArray(extensions) ? extensions : [extensions];
          match = exts.some(e => d.name.endsWith(e));
        }
        
        if (/\.(beauty|deob|jdeob|restringer|cleaned)\.js$/.test(d.name)) match = false;
        if (d.name.endsWith('.webcrack')) match = false;
        
        if (match) {
          let size = 0;
          try { size = fs.statSync(fullPath).size; } catch {}
          results.push({ relPath, size, name: d.name });
        }
      }
    }
  } catch {}
  return results;
}

function askRl(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function pickFiles(cfg, options = {}, rl) {
  const { extensions = null, label = 'file' } = options;
  
  log(`\n${C.bold}${C.blue}═══ Pilih ${label} ═══${C.reset}`);
  log(`Folder Kerja: ${C.dim}${cfg.workDir}${C.reset}`);
  
  // PERBAIKAN: 1 buat scan, 0 buat batal. Ganti path masuk ke sub-menu
  log(`\n  ${C.cyan}[1]${C.reset} Scan file di folder ini (Rekursif)`);
  log(`  ${C.cyan}[2]${C.reset} Ganti Folder Kerja`);
  log(`  ${C.cyan}[0]${C.reset} Batal / Kembali\n`);

  const preInput = await askRl(rl, 'Pilih [0-2]: ');
  const cmd = preInput.trim();

  if (cmd === '0') return []; // Batal

  if (cmd === '2') {
      const newPath = await askRl(rl, 'Masukkan path folder (contoh: /sdcard/Download) [0 = Batal]: ');
      if (newPath.trim() === '0') return pickFiles(cfg, options, rl); // Balik ke menu ini
      if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
          cfg.workDir = newPath;
          log(C.green(`[+] Folder kerja diubah ke: ${newPath}`));
          return pickFiles(cfg, options, rl); // Panggil ulang menu
      } else {
          err('Path tidak valid atau bukan folder.');
          return pickFiles(cfg, options, rl);
      }
  }

  if (cmd !== '1') {
      warn('Pilihan tidak valid.');
      return pickFiles(cfg, options, rl);
  }

  // --- MULAI SCAN (Cmd == 1) ---
  const files = listFilesRecursive(cfg.workDir, extensions, cfg.workDir);

  if (files.length === 0) {
    err(`Tidak ada ${label} yang cocok di ${cfg.workDir}`);
    // Kalau kosong, tawarin ganti folder (karena biasanya user salah tempat)
    const yn = await askRl(rl, 'Ganti folder kerja? (y/n) [0 = Batal]: ');
    if (yn.trim() === '0') return [];
    if (yn.toLowerCase() === 'y') {
      const newPath = await askRl(rl, 'Masukkan path folder baru [0 = Batal]: ');
      if (newPath.trim() !== '0' && fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
          cfg.workDir = newPath;
          return pickFiles(cfg, options, rl);
      } else {
          err('Path tidak valid.');
          return [];
      }
    }
    return [];
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  log(`\nDitemukan ${files.length} file (rekursif)\n`);

  files.forEach((f, i) => {
    log(`  ${C.cyan}[${i + 1}]${C.reset} ${f.relPath} ${C.dim}(${humanSize(f.size)})${C.reset}`);
  });
  
  log(`\n${C.dim}Format: 1 | 1,3,5 | 1-4 | all | 0 (Batal)${C.reset}`);
  const input = await askRl(rl, `\nPilih [1-${files.length}]: `);
  
  if (input.trim() === '0') return [];

  const picks = parseSelection(input, files.length);
  if (picks.length === 0) { warn('Tidak ada dipilih'); return []; }
  
  return picks.map(i => files[i - 1].relPath);
}

module.exports = { listFiles: listFilesRecursive, pickFiles };
