const fs = require('fs');
const path = require('path');
const { saveConfig, DEFAULTS } = require('./config');
const { C, log, ok, warn, err, title } = require('./utils');

function addToHistory(cfg, dir) {
  if (!cfg.history) cfg.history = [];
  cfg.history = [dir, ...cfg.history.filter(h => h !== dir)].slice(0, 10);
}

async function promptChangeWorkDir(cfg, rl) {
  const ask = (q) => new Promise(res => rl.question(q, res));
  
  while (true) {
    title('Folder Kerja');
    log(`  Saat ini: ${C.cyan}${cfg.workDir}${C.reset}\n`);
    log(`  ${C.cyan}[1]${C.reset} Ketik path manual`);
    log(`  ${C.cyan}[2]${C.reset} Pilih dari history`);
    log(`  ${C.cyan}[3]${C.reset} Browse subfolder`);
    log(`  ${C.cyan}[4]${C.reset} Reset ke default`);
    log(`  ${C.cyan}[0]${C.reset} Kembali\n`);

    const choice = await ask('Pilih: ');
    let newDir = null;

    if (choice === '1') {
      const input = await ask('Path folder [0 = Batal]: ');
      if (!input || input.trim() === '0') { warn('Batal'); continue; }
      const resolved = path.resolve(input.replace(/^~/, process.env.HOME || ''));
      if (!fs.existsSync(resolved)) {
        warn(`Tidak ditemukan: ${resolved}`);
        const yn = await ask('Buat folder ini? (y/n) [0 = Batal]: ');
        if (yn.trim() === '0') continue;
        if (yn.toLowerCase() === 'y') {
          try { fs.mkdirSync(resolved, { recursive: true }); ok(`Dibuat: ${resolved}`); newDir = resolved; }
          catch (e) { err(`Gagal: ${e.message}`); }
        }
        continue;
      }
      if (!fs.statSync(resolved).isDirectory()) { err('Bukan folder'); continue; }
      newDir = resolved;
    } else if (choice === '2') {
      if (!cfg.history || cfg.history.length === 0) { warn('Belum ada history'); continue; }
      log('');
      cfg.history.forEach((h, i) => {
        const exists = fs.existsSync(h) ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
        log(`  ${C.cyan}[${i + 1}]${C.reset} ${exists} ${h}`);
      });
      const pick = await ask('\nPilih nomor [0 = Batal]: ');
      if (pick.trim() === '0') continue;
      const idx = parseInt(pick, 10);
      if (idx >= 1 && idx <= cfg.history.length) newDir = cfg.history[idx - 1];
    } else if (choice === '3') {
      try {
        const subs = fs.readdirSync(cfg.workDir, { withFileTypes: true })
          .filter(d => d.isDirectory()).map(d => d.name).sort();
        const parent = path.dirname(cfg.workDir);
        log(`\n  ${C.cyan}[0]${C.reset} .. (parent) ${parent}`);
        subs.forEach((s, i) => log(`  ${C.cyan}[${i + 1}]${C.reset} ${s}/`));
        const pick = await ask('\nPilih nomor atau ketik nama [0 = Batal]: ');
        if (pick.trim() === '0') continue;
        let chosen;
        if (/^\d+$/.test(pick)) {
          const idx = parseInt(pick, 10);
          if (idx === 0) chosen = parent;
          else if (idx >= 1 && idx <= subs.length) chosen = path.join(cfg.workDir, subs[idx - 1]);
        } else if (pick) {
          chosen = path.resolve(cfg.workDir, pick);
        }
        if (chosen && fs.existsSync(chosen)) newDir = chosen;
        else if (chosen) warn(`Tidak ditemukan: ${chosen}`);
      } catch (e) { err(`Gagal browse: ${e.message}`); }
    } else if (choice === '4') {
      newDir = DEFAULTS.workDir;
    } else if (choice === '0') {
      return;
    } else {
      warn('Pilihan tidak valid');
      continue;
    }

    if (newDir) {
      cfg.workDir = newDir;
      addToHistory(cfg, newDir);
      saveConfig(cfg);
      ok(`Folder kerja: ${newDir}`);
      return;
    }
  }
}

module.exports = { promptChangeWorkDir };
