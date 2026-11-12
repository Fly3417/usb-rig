const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'rig_config.json');

const DEFAULTS = {
  workDir: process.cwd(),
  history: []
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {}
  return { ...DEFAULTS };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {}
}

module.exports = { loadConfig, saveConfig, DEFAULTS };
