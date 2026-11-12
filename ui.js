const chalk = require('chalk');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const lang = require('./lang.js');

let config = { version: '13.0', lang: 'id' };
try { config = require('./config.json'); } catch (e) {}

function t(key) {
    const currentLang = config.lang || 'id';
    return (lang[currentLang] && lang[currentLang][key]) ? lang[currentLang][key] : key;
}

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

function getBatteryStatus() {
    try {
        const batRaw = execSync('termux-battery-status 2>/dev/null').toString();
        const batData = JSON.parse(batRaw);
        const icon = batData.status === 'CHARGING' ? '⚡' : '';
        return `${batData.percentage}% ${icon}`;
    } catch (e) {
        return "N/A";
    }
}

async function showBanner() {
    process.stdout.write('\x1B[3J\x1B[2J\x1B[0f');
    const battery = getBatteryStatus();

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
    console.log(chalk.gray('  │ ') + chalk.white('Battery: ') + chalk.green(battery.padEnd(45)) + chalk.gray('│'));
    console.log(chalk.gray('  └──────────────────────────────────────────────────────┘'));
    console.log();
}

function renderMenu(title, items, borderColor = chalk.yellow) {
    const lineWidth = 52;
    const titleText = ` ${title} `;
    const leftSide = Math.floor((lineWidth - titleText.length) / 2);
    const rightSide = lineWidth - titleText.length - leftSide;
    
    console.log(borderColor.bold('  ╔' + '═'.repeat(leftSide)) + 
                chalk.white.bold(titleText) + 
                borderColor.bold('═'.repeat(rightSide) + '╗'));
    
    items.forEach(item => {
        const numColor = item.key === '0' ? chalk.red.bold : chalk.green.bold;
        const labelColor = item.key === '0' ? chalk.gray : chalk.white;
        const icon = item.icon ? item.icon + ' ' : '  ';
        console.log(borderColor.bold('  ║ ') + 
            numColor(`[${item.key}] `) + icon +
            labelColor(item.label.padEnd(18)) + 
            chalk.gray(item.desc.padEnd(19)) + 
            borderColor.bold('║')
        );
    });
    
    console.log(borderColor.bold('  ╚' + '═'.repeat(lineWidth) + '╝'));
    console.log();
}

async function showMainMenu() {
    renderMenu(t('main_menu'), [
        { key: '1', label: t('menu_tools'), desc: t('menu_tools_desc'), icon: '🛠️' },
        { key: '2', label: t('menu_file'), desc: t('menu_file_desc'), icon: '📁' },
        { key: '3', label: t('menu_util'), desc: t('menu_util_desc'), icon: '⚙️' },
        { key: '0', label: t('menu_exit'), desc: t('menu_exit_desc'), icon: '🚪' }
    ]);
}

async function showToolsMenu() {
    renderMenu(t('tools_arsenal'), [
        { key: '1', label: t('show_tools'), desc: t('show_tools_desc'), icon: '📄' },
        { key: '2', label: t('cmd_runner'), desc: t('cmd_runner_desc'), icon: '⌨️' },
        { key: '0', label: t('back'), desc: t('back_desc'), icon: '🔙' }
    ]);
}

async function showFileMenu() {
    renderMenu(t('file_manager'), [
        { key: '1', label: t('folder_tools'), desc: t('folder_tools_desc'), icon: '📁' },
        { key: '2', label: t('folder_payloads'), desc: t('folder_payloads_desc'), icon: '📂' },
        { key: '3', label: t('root_usb'), desc: t('root_usb_desc'), icon: '💾' },
        { key: '4', label: t('sdcard_exp'), desc: t('sdcard_exp_desc'), icon: '📲' },
        { key: '5', label: t('change_path'), desc: t('change_path_desc'), icon: '🔍' },
        { key: '0', label: t('back'), desc: t('back_desc'), icon: '🔙' }
    ]);
}

async function showUtilityMenu() {
    renderMenu(t('utility_system'), [
        { key: '1', label: t('cek_env'), desc: t('cek_env_desc'), icon: '📊' },
        { key: '2', label: t('dl_github'), desc: t('dl_github_desc'), icon: '📦' },
        { key: '3', label: t('eject_usb'), desc: t('eject_usb_desc'), icon: '⏏️' },
        { key: '4', label: t('web_server'), desc: t('web_server_desc'), icon: '🌐' },
        { key: '5', label: t('port_scan'), desc: t('port_scan_desc'), icon: '🛡️' },
        { key: '6', label: t('cek_bat'), desc: t('cek_bat_desc'), icon: '🔋' },
        { key: '7', label: t('update_sys'), desc: t('update_sys_desc'), icon: '🔄' },
        { key: '8', label: t('backup_sys'), desc: t('backup_sys_desc'), icon: '📤' },
        { key: '0', label: t('back'), desc: t('back_desc'), icon: '🔙' }
    ]);
}

async function showFileActionMenu(fileName) {
    renderMenu(`FILE: ${fileName.substring(0, 15)}`, [
        { key: '1', label: t('action_run'), desc: t('action_run_desc'), icon: '▶️' },
        { key: '2', label: t('action_view'), desc: t('action_view_desc'), icon: '📝' },
        { key: '3', label: t('action_rename'), desc: t('action_rename_desc'), icon: '✏️' },
        { key: '4', label: t('action_delete'), desc: t('action_delete_desc'), icon: '🗑️' },
        { key: '5', label: t('action_encrypt'), desc: t('action_encrypt_desc'), icon: '🔒' },
        { key: '0', label: t('back'), desc: t('action_back_list') || 'Back to list', icon: '🔙' }
    ]);
}

async function showFolderActionMenu(folderName) {
    renderMenu(`FOLDER: ${folderName.substring(0, 15)}`, [
        { key: '1', label: t('action_open'), desc: t('action_open_desc'), icon: '📂' },
        { key: '2', label: t('action_rename'), desc: t('action_rename_desc'), icon: '✏️' },
        { key: '3', label: t('action_delete'), desc: t('action_delete_desc'), icon: '🗑️' },
        { key: '4', label: t('action_enc_folder'), desc: t('action_enc_folder_desc'), icon: '🔒' },
        { key: '0', label: t('back'), desc: t('action_back_list') || 'Back to list', icon: '🔙' }
    ]);
}

module.exports = { showBanner, showMainMenu, showToolsMenu, showFileMenu, showUtilityMenu, showFileActionMenu, showFolderActionMenu };
