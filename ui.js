const chalk = require('chalk');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

let config = { version: '10.0' };
try { config = require('./config.json'); } catch (e) {}

function getDeviceInfo() {
    let info = { model: "Android Device", cpu: "ARM64", ram: "Unknown", usbFree: "Unknown", usbTotal: "Unknown" };
    try { info.model = execSync('getprop ro.product.model').toString().trim(); } catch (e) {}
    try { info.cpu = execSync('getprop ro.product.cpu.abi').toString().trim(); } catch (e) {}
    try { info.ram = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB"; } catch (e) {}
    try {
        const df = execSync('df -h .').toString().trim().split('\n')[1].split(/\s+/);
        info.usbTotal = df[1]; info.usbFree = df[3];
    } catch (e) {}
    return info;
}

async function showBanner() {
    process.stdout.write('\x1B[3J\x1B[2J\x1B[0f');
    
    console.log(chalk.cyan.bold(`
    ██╗   ██╗███████╗██████╗     ██████╗ ██╗ ██████╗ 
    ██║   ██║██╔════╝██╔══██╗    ██╔══██╗██║██╔════╝ 
    ██║   ██║███████╗██████╔╝    ██████╔╝██║██║  ███╗
    ██║   ██║╚════██║██╔══██╗    ██╔══██╗██║██║   ██║
    ╚██████╔╝███████║██████╔╝    ██║  ██║██║╚██████╔╝
     ╚═════╝ ╚══════╝╚═════╝     ╚═╝  ╚═╝╚═╝ ╚═════╝ 
    `));

    console.log(chalk.bgCyan.black.bold('        USB RIG - AUTHORIZE        '));
    console.log(chalk.gray.italic('             By SevenByte\n'));
    console.log(chalk.yellow(`    [ Portable USB RIG v${config.version} ]\n`));

    const ip = Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1';
    const dev = getDeviceInfo();

    console.log(chalk.gray('  ┌──────────────────────────────────────────────────────┐'));
    console.log(chalk.gray('  │ ') + chalk.white('Device : ') + chalk.yellow(dev.model.padEnd(45)) + chalk.gray('│'));
    console.log(chalk.gray('  │ ') + chalk.white('IP     : ') + chalk.green(ip.padEnd(45)) + chalk.gray('│'));
    console.log(chalk.gray('  │ ') + chalk.white('USB    : ') + chalk.green((dev.usbFree + ' free').padEnd(45)) + chalk.gray('│'));
    console.log(chalk.gray('  └──────────────────────────────────────────────────────┘'));
    console.log();
}

function renderMenu(title, items, borderColor = chalk.yellow) {
    // Lebar total garis (44 karakter)
    const lineWidth = 44;
    
    // --- GARIS ATAS (Dipotong tengah buat judul) ---
    const titleText = ` ${title} `;
    const leftSide = Math.floor((lineWidth - titleText.length) / 2);
    const rightSide = lineWidth - titleText.length - leftSide;
    
    // Karakter ujung kiri pake ╔, ujung kanan pake ╗
    console.log(borderColor.bold('  ╔' + '═'.repeat(leftSide)) + 
                chalk.white.bold(titleText) + 
                borderColor.bold('═'.repeat(rightSide) + '╗'));
    
    // --- ISI MENU (TANPA GARIS SAMPING) ---
    items.forEach(item => {
        const numColor = item.key === '0' ? chalk.red.bold : chalk.green.bold;
        const labelColor = item.key === '0' ? chalk.gray : chalk.white;
        
        const icon = item.icon ? item.icon + ' ' : '  ';
        
        // Padding disesuaikan biar rapi ke bawah
        const labelPadded = item.label.padEnd(18);
        const descPadded = item.desc.padEnd(20);

        console.log('   ' + 
            numColor(`[${item.key}] `) + 
            icon +
            labelColor(labelPadded) + 
            chalk.gray(descPadded)
        );
    });
    
    // --- GARIS BAWAH ---
    console.log(borderColor.bold('  ╚' + '═'.repeat(lineWidth) + '╝'));
    console.log();
}

async function showMainMenu() {
    renderMenu('MAIN MENU', [
        { key: '1', label: 'Tools Arsenal', desc: 'Run .js/.py/.sh/bin', icon: '🛠️' },
        { key: '2', label: 'File Manager', desc: 'Browse USB files', icon: '📁' },
        { key: '3', label: 'Utility & System', desc: 'Env, Download', icon: '⚙️' },
        { key: '0', label: 'Keluar', desc: 'Exit system', icon: '🚪' }
    ]);
}

async function showToolsMenu() {
    renderMenu('TOOLS ARSENAL', [
        { key: '1', label: 'Show Tools', desc: 'List files in /tools', icon: '📄' },
        { key: '2', label: 'Command Runner', desc: 'Execute shell', icon: '⌨️' },
        { key: '0', label: 'Kembali', desc: 'Back to Main', icon: '🔙' }
    ]);
}

async function showFileMenu() {
    renderMenu('FILE MANAGER', [
        { key: '1', label: 'Folder /tools', desc: 'Manage tools', icon: '📁' },
        { key: '2', label: 'Folder /payloads', desc: 'Manage payloads', icon: '📂' },
        { key: '3', label: 'Root USB', desc: 'Manage root', icon: '💾' },
        { key: '4', label: 'SDCard Explorer', desc: 'Import from phone', icon: '📲' },
        { key: '5', label: 'Ganti Path', desc: 'Change directory', icon: '🔍' },
        { key: '0', label: 'Kembali', desc: 'Back to Main', icon: '🔙' }
    ]);
}

async function showUtilityMenu() {
    renderMenu('UTILITY & SYSTEM', [
        { key: '1', label: 'Cek Environment', desc: 'Node/Python/Go', icon: '📊' },
        { key: '2', label: 'Download GitHub', desc: 'Clone repo', icon: '📦' },
        { key: '3', label: 'Matikan USB', desc: 'Safe eject', icon: '⏏️' },
        { key: '4', label: 'Web Server', desc: 'Drag & Drop', icon: '🌐' },
        { key: '5', label: 'Port Scanner', desc: 'Kill hanging port', icon: '🛡️' },
        { key: '0', label: 'Kembali', desc: 'Back to Main', icon: '🔙' }
    ]);
}

async function showFileActionMenu(fileName) {
    renderMenu(`FILE: ${fileName.substring(0, 15)}`, [
        { key: '1', label: 'Run / Execute', desc: 'Run this file', icon: '▶️' },
        { key: '2', label: 'View / Edit', desc: 'Edit text', icon: '📝' },
        { key: '3', label: 'Rename', desc: 'Rename file', icon: '✏️' },
        { key: '4', label: 'Delete', desc: 'Delete file', icon: '🗑️' },
        { key: '0', label: 'Kembali', desc: 'Back to list', icon: '🔙' }
    ]);
}

module.exports = { showBanner, showMainMenu, showToolsMenu, showFileMenu, showUtilityMenu, showFileActionMenu };
