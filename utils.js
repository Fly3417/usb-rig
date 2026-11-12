const chalk = require('chalk');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = (msg) => console.log(msg);
const ok = (msg) => console.log(chalk.green(`[+] ${msg}`));
const warn = (msg) => console.log(chalk.yellow(`[!] ${msg}`));
const err = (msg) => console.log(chalk.red(`[-] ${msg}`));
const info = (msg) => console.log(chalk.cyan(`[*] ${msg}`));
const title = (msg) => console.log(chalk.bold.cyan(`\n=== ${msg} ===`));

const ask = (question) => {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function parseSelection(input, max) {
  const res = new Set();
  if (!input || input.trim().toLowerCase() === 'all') {
    if (input && input.trim().toLowerCase() === 'all') {
      for (let i = 1; i <= max; i++) res.add(i);
    }
    return Array.from(res);
  }
  input.split(',').forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end && i <= max; i++) res.add(i);
      }
    } else {
      const num = Number(part);
      if (!isNaN(num) && num >= 1 && num <= max) res.add(num);
    }
  });
  return Array.from(res);
}

module.exports = { C, log, ok, warn, err, info, ask, title, humanSize, parseSelection };
