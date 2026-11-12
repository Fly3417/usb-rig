const readline = require('readline');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');
const ui = require('./ui.js');
const { loadConfig, saveConfig } = require('./config.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

process.on('SIGINT', () => {
    console.log(chalk.red('\n\n[!] Dibatalkan oleh user (CTRL+C). Keluar...'));
    process.exit(0);
});

const USB_PATH = process.cwd();
const TOOLS_DIR = path.join(USB_PATH, 'tools');
const PAYLOAD_DIR = path.join(USB_PATH, 'payloads');
const LOG_DIR = path.join(USB_PATH, 'logs');

let cfg = loadConfig();
if (!cfg.workDir) cfg.workDir = USB_PATH;

// --- CORE: EKSEKUSI ---
function executeFile(filePath, returnCallback) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    let command = '';
    if (ext === '.js') command = `node "${filePath}"`;
    else if (ext === '.py') command = `python "${filePath}"`;
    else if (ext === '.sh' || ext === '.bash') command = `bash "${filePath}"`;
    else {
        const cacheDir = path.join(process.env.HOME || '/data/data/com.termux/files/home', '.usb_rig_cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        const cachedPath = path.join(cacheDir, fileName);
        fs.copyFileSync(filePath, cachedPath);
        fs.chmodSync(cachedPath, '755');
        command = `"${cachedPath}"`;
    }

    rl.question(chalk.yellow(`\n[*] Masukkan argumen tambahan [Enter = kosong, 0 = Batal]: `), (args) => {
        if (args.trim() === '0') return returnCallback();
        const finalCommand = args.trim() ? `${command} ${args}` : command;
        const logFile = path.join(LOG_DIR, `${Date.now()}_${fileName}.log`);
        
        console.log(chalk.green(`\n[*] Menjalankan: ${fileName} ${args}`));
        console.log(chalk.cyan(`[*] Log: ${logFile}\n`));
        
        try {
            execSync(`${finalCommand} 2>&1 | tee "${logFile}"`, { stdio: 'inherit', shell: '/data/data/com.termux/files/usr/bin/bash' });
        } catch (e) {}
        
        askNext(returnCallback);
    });
}

// --- CORE: ACTION MENU (FILE & FOLDER) ---
async function fileActionMenu(filePath, returnCallback) {
    const fileName = path.basename(filePath);
    await ui.showFileActionMenu(fileName);

    rl.question(chalk.cyan('  └─> Pilih aksi [0-4]: '), (answer) => {
        console.log();
        switch(answer) {
            case '1': executeFile(filePath, returnCallback); break;
            case '2': viewEditFile(filePath, returnCallback); break;
            case '3': renameItem(filePath, returnCallback); break;
            case '4': deleteItem(filePath, returnCallback); break;
            case '0': returnCallback(); break;
            default: setTimeout(() => fileActionMenu(filePath, returnCallback), 1000);
        }
    });
}

function viewEditFile(filePath, returnCallback) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(chalk.cyan('\n=== INTERNAL EDITOR ==='));
        console.log(chalk.gray('(Mode Read-Only. Gunakan Web Server untuk edit)'));
        console.log(chalk.gray('--------------------------------------------------'));
        console.log(content);
        console.log(chalk.gray('--------------------------------------------------'));
    } catch (err) { console.log(chalk.red(`[!] File binary atau tidak bisa dibaca.`)); }
    askNext(returnCallback);
}

function renameItem(filePath, returnCallback) {
    const isDir = fs.statSync(filePath).isDirectory();
    rl.question(chalk.cyan(`Masukkan nama baru untuk ${isDir ? 'folder' : 'file'} [0 = Batal]: `), (newName) => {
        if (!newName || newName.trim() === '0') { console.log(chalk.gray('Batal.')); return askNext(returnCallback); }
        try {
            fs.renameSync(filePath, path.join(path.dirname(filePath), newName));
            console.log(chalk.green(`[*] Sukses di-rename.`));
        } catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        askNext(returnCallback);
    });
}

function deleteItem(filePath, returnCallback) {
    const isDir = fs.statSync(filePath).isDirectory();
    rl.question(chalk.red(`Yakin mau hapus ${isDir ? 'folder' : 'file'} ini? (y/n) [0 = Batal]: `), (ans) => {
        if (ans.trim() === '0') return askNext(returnCallback);
        if (ans.toLowerCase() === 'y') {
            try { 
                if (isDir) fs.rmdirSync(filePath, { recursive: true });
                else fs.unlinkSync(filePath);
                console.log(chalk.green(`[*] Dihapus.`)); 
            } 
            catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        }
        askNext(returnCallback);
    });
}

// --- FITUR: USB FILE EXPLORER (Nampilin Folder & File) ---
async function usbExplorer(currentPath, title, returnCallback) {
    try {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        const folders = items.filter(i => i.isDirectory() && !i.name.startsWith('.'));
        const files = items.filter(i => i.isFile() && !i.name.startsWith('.'));

        console.log(chalk.cyan.bold('\n  +--------------------------------------------------------+'));
        console.log(chalk.cyan.bold('  |') + chalk.white.bold(` ${title.padEnd(54)} `) + chalk.cyan.bold('|'));
        console.log(chalk.cyan.bold('  +--------------------------------------------------------+'));
        console.log(chalk.gray(`  Path: ${currentPath}\n`));

        let index = 1;
        const itemList = [];

        // 1. Tampilin Folder
        folders.forEach(f => {
            console.log(`  ${chalk.cyan(`[${index}]`)} 📁 ${chalk.yellow(f.name + '/')}`);
            itemList.push({ type: 'dir', name: f.name, path: path.join(currentPath, f.name) });
            index++;
        });

        // 2. Tampilin File
        files.forEach(f => {
            console.log(`  ${chalk.cyan(`[${index}]`)} 📄 ${f.name}`);
            itemList.push({ type: 'file', name: f.name, path: path.join(currentPath, f.name) });
            index++;
        });

        if (itemList.length === 0) console.log(chalk.red('  (Folder kosong)'));

        console.log(chalk.gray('\n  [N] Buat Folder Baru (New Folder)'));
        if (currentPath !== USB_PATH) console.log(chalk.gray('  [B] Kembali ke folder atas'));
        console.log(chalk.gray('  [0] Kembali / Batal'));

        rl.question(chalk.cyan(`\n  Pilih nomor [0-${itemList.length}, N, B]: `), (ans) => {
            if (ans === '0') return returnCallback();
            
            if (ans.toUpperCase() === 'B') {
                if (currentPath !== USB_PATH) {
                    return usbExplorer(path.dirname(currentPath), title, returnCallback);
                }
                return usbExplorer(currentPath, title, returnCallback);
            }

            if (ans.toUpperCase() === 'N') {
                rl.question(chalk.cyan('  Masukkan nama folder baru [0 = Batal]: '), (folderName) => {
                    if (folderName.trim() === '0') return usbExplorer(currentPath, title, returnCallback);
                    try {
                        const newPath = path.join(currentPath, folderName);
                        if (!fs.existsSync(newPath)) {
                            fs.mkdirSync(newPath);
                            console.log(chalk.green(`  [+] Folder '${folderName}' berhasil dibuat.`));
                        } else {
                            console.log(chalk.red('  [!] Folder sudah ada.'));
                        }
                    } catch (e) { console.log(chalk.red(`  [!] Gagal buat folder: ${e.message}`)); }
                    usbExplorer(currentPath, title, returnCallback);
                });
                return;
            }

            const idx = parseInt(ans) - 1;
            if (idx >= 0 && idx < itemList.length) {
                const selected = itemList[idx];
                if (selected.type === 'dir') {
                    // Kalau folder, masuk ke dalam
                    usbExplorer(selected.path, `FOLDER: ${selected.name}`, returnCallback);
                } else {
                    // Kalau file, buka action menu
                    fileActionMenu(selected.path, () => usbExplorer(currentPath, title, returnCallback));
                }
            } else {
                console.log(chalk.red('  Pilihan tidak valid.'));
                setTimeout(() => usbExplorer(currentPath, title, returnCallback), 1000);
            }
        });

    } catch (e) {
        console.log(chalk.red(`\n  [!] Gagal buka folder: ${e.message}`));
        return askNext(returnCallback);
    }
}

// --- FITUR: PILIH FOLDER TUJUAN (Dari SDCard ke USB) ---
function chooseTargetFolder(selectedFile, sourcePath, returnCallback) {
    let currentTarget = USB_PATH;

    const browseTarget = () => {
        const items = fs.readdirSync(currentTarget, { withFileTypes: true });
        const folders = items.filter(i => i.isDirectory() && !i.name.startsWith('.'));

        console.log(chalk.cyan.bold('\n  +--------------------------------------------------------+'));
        console.log(chalk.cyan.bold('  |') + chalk.white.bold('               PILIH FOLDER TUJUAN DI USB               ') + chalk.cyan.bold('|'));
        console.log(chalk.cyan.bold('  +--------------------------------------------------------+'));
        console.log(chalk.gray(`  Path Tujuan: ${currentTarget}\n`));

        let index = 1;
        const folderList = [];

        folders.forEach(f => {
            console.log(`  ${chalk.cyan(`[${index}]`)} 📁 ${chalk.yellow(f.name)}`);
            folderList.push(f.name);
            index++;
        });

        console.log(chalk.gray('\n  [S] Simpan di folder ini'));
        console.log(chalk.gray('  [B] Kembali ke atas'));
        console.log(chalk.gray('  [0] Batalkan'));

        rl.question(chalk.cyan(`\n  Pilih nomor folder [0-${folderList.length}, S, B]: `), (ans) => {
            if (ans === '0') return returnCallback();
            
            if (ans.toUpperCase() === 'S') {
                try {
                    const destPath = path.join(currentTarget, selectedFile);
                    fs.copyFileSync(sourcePath, destPath);
                    fs.chmodSync(destPath, '755');
                    console.log(chalk.green(`\n  [+] SUKSES! ${selectedFile} berhasil dicopy ke:`));
                    console.log(chalk.white(`      ${currentTarget}`));
                } catch (e) {
                    console.log(chalk.red(`\n  [!] Gagal copy: ${e.message}`));
                }
                return askNext(returnCallback);
            }

            if (ans.toUpperCase() === 'B') {
                if (currentTarget !== USB_PATH) currentTarget = path.dirname(currentTarget);
                else console.log(chalk.red('  Udah di root USB.'));
                return browseTarget();
            }

            const idx = parseInt(ans) - 1;
            if (idx >= 0 && idx < folderList.length) {
                currentTarget = path.join(currentTarget, folderList[idx]);
                browseTarget();
            } else {
                console.log(chalk.red('  Pilihan tidak valid.'));
                setTimeout(browseTarget, 1000);
            }
        });
    };
    browseTarget();
}

// --- FITUR: SDCARD EXPLORER ---
async function sdcardExplorer() {
    let currentPath = cfg.workDir || '/sdcard';

    const scanAndList = async () => {
        try {
            const items = fs.readdirSync(currentPath, { withFileTypes: true });
            const folders = items.filter(i => i.isDirectory() && !i.name.startsWith('.'));
            const files = items.filter(i => i.isFile() && !i.name.startsWith('.'));

            console.log(chalk.cyan.bold('\n  +--------------------------------------------------------+'));
            console.log(chalk.cyan.bold('  |') + chalk.white.bold('               SDCARD EXPLORER & IMPORTER               ') + chalk.cyan.bold('|'));
            console.log(chalk.cyan.bold('  +--------------------------------------------------------+'));
            console.log(chalk.gray(`  Path: ${currentPath}\n`));

            let index = 1;
            const itemList = [];

            folders.forEach(f => {
                console.log(`  ${chalk.cyan(`[${index}]`)} 📁 ${chalk.yellow(f.name)}`);
                itemList.push({ type: 'dir', name: f.name, path: path.join(currentPath, f.name) });
                index++;
            });
            files.forEach(f => {
                console.log(`  ${chalk.cyan(`[${index}]`)} 📄 ${f.name}`);
                itemList.push({ type: 'file', name: f.name, path: path.join(currentPath, f.name) });
                index++;
            });

            if (itemList.length === 0) console.log(chalk.red('  (Folder kosong)'));

            console.log(chalk.gray('\n  [G] Ganti Path / Ketik Manual'));
            console.log(chalk.gray('  [0] Kembali ke File Manager'));

            rl.question(chalk.cyan(`\n  Pilih nomor [0-${itemList.length}, G]: `), (ans) => {
                if (ans === '0') return fileManagerMenu();
                if (ans.toUpperCase() === 'G') {
                    rl.question(chalk.cyan('  Masukkan path baru [0 = Batal]: '), (newPath) => {
                        if (newPath.trim() === '0') return scanAndList();
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            currentPath = newPath;
                            cfg.workDir = currentPath;
                            saveConfig(cfg);
                            scanAndList();
                        } else {
                            console.log(chalk.red('  Path tidak valid!'));
                            setTimeout(scanAndList, 1500);
                        }
                    });
                    return;
                }

                const idx = parseInt(ans) - 1;
                if (idx >= 0 && idx < itemList.length) {
                    const selected = itemList[idx];
                    if (selected.type === 'dir') {
                        currentPath = selected.path;
                        cfg.workDir = currentPath;
                        saveConfig(cfg);
                        scanAndList();
                    } else {
                        chooseTargetFolder(selected.name, selected.path, () => scanAndList());
                    }
                } else {
                    console.log(chalk.red('  Pilihan tidak valid.'));
                    setTimeout(scanAndList, 1000);
                }
            });
        } catch (e) {
            console.log(chalk.red(`\n  [!] Gagal buka folder: ${e.message}`));
            setTimeout(() => fileManagerMenu(), 2000);
        }
    };
    scanAndList();
}

// --- MENU HANDLERS ---
async function toolsMenu() {
    await ui.showToolsMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-2]: '), (answer) => {
        if (answer === '1') {
            usbExplorer(TOOLS_DIR, 'TOOLS ARSENAL', () => toolsMenu());
        } else if (answer === '2') {
            rl.question(chalk.yellow('\n[*] Masukkan perintah terminal [0 = Batal]: '), (cmd) => {
                if (cmd.trim() === '0') return toolsMenu();
                console.log(chalk.green(`\n[*] Menjalankan: ${cmd}\n`));
                try { execSync(cmd, { stdio: 'inherit', shell: '/data/data/com.termux/files/usr/bin/bash' }); } catch (e) {}
                askNext(() => toolsMenu());
            });
        } else if (answer === '0') { main(); } else { toolsMenu(); }
    });
}

async function fileManagerMenu() {
    await ui.showFileMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-5]: '), (answer) => {
        switch(answer) {
            case '1': usbExplorer(TOOLS_DIR, 'FOLDER TOOLS', () => fileManagerMenu()); break;
            case '2': usbExplorer(PAYLOAD_DIR, 'FOLDER PAYLOADS', () => fileManagerMenu()); break;
            case '3': usbExplorer(USB_PATH, 'ROOT USB', () => fileManagerMenu()); break;
            case '4': sdcardExplorer(); break;
            case '5': sdcardExplorer(); break;
            case '0': main(); break;
            default: setTimeout(() => fileManagerMenu(), 1000);
        }
    });
}

async function utilityMenu() {
    await ui.showUtilityMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-5]: '), (answer) => {
        switch(answer) {
            case '1': showSystemInfo(); break;
            case '2': githubDownloader(); break;
            case '3': ejectUsb(); break;
            case '4': webServerMenu(); break;
            case '5': portScanner(); break;
            case '0': main(); break;
            default: setTimeout(() => utilityMenu(), 1000);
        }
    });
}

async function webServerMenu() {
    let isRunning = false;
    try { if (execSync('pgrep -f "webserver.js"').toString().trim()) isRunning = true; } catch (e) {}

    console.log(chalk.yellow('\n=== WEB SERVER MANAGER ==='));
    console.log(`Status: ${isRunning ? chalk.green('AKTIF') : chalk.red('MATI')}\n`);
    console.log('1. Nyalakan Web Server');
    console.log('2. Matikan Web Server');
    console.log('3. Cek IP & URL Akses');
    console.log('0. Kembali');

    rl.question(chalk.cyan('\nPilih [0-3]: '), (ans) => {
        if (ans === '0') return utilityMenu();
        if (ans === '1') {
            if (isRunning) { console.log(chalk.red('Server sudah jalan!')); return askNext(() => webServerMenu()); }
            console.log(chalk.cyan('[*] Menyalakan Web Server di background...'));
            try {
                const subprocess = spawn('node', [path.join(USB_PATH, 'webserver.js')], { detached: true, stdio: 'ignore' });
                subprocess.unref();
                console.log(chalk.green('[+] Web Server dinyalakan!'));
                const ip = Object.values(require('os').networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1';
                console.log(chalk.cyan.bold(`    Buka browser di PC: http://${ip}:8080`));
            } catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
            askNext(() => webServerMenu());
        } else if (ans === '2') {
            if (!isRunning) { console.log(chalk.red('Server emang mati.')); return askNext(() => webServerMenu()); }
            try { execSync('pkill -9 -f "webserver.js" || true'); console.log(chalk.green('[+] Web Server dimatikan.')); } catch (e) {}
            askNext(() => webServerMenu());
        } else if (ans === '3') {
            const ip = Object.values(require('os').networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1';
            console.log(chalk.cyan(`\nURL Akses: http://${ip}:8080`));
            askNext(() => webServerMenu());
        } else webServerMenu();
    });
}

async function portScanner() {
    console.log(chalk.yellow('\n=== PORT SCANNER & KILLER ==='));
    rl.question(chalk.cyan('Masukkan range port (contoh: 8000-8100) [0 = Batal]: '), (range) => {
        if (range.trim() === '0') return utilityMenu();
        let start = 1, end = 65535;
        if (range.includes('-')) { const parts = range.split('-'); start = parseInt(parts[0]); end = parseInt(parts[1]); }
        else if (range.length > 0) { start = parseInt(range); end = parseInt(range); }
        if (isNaN(start) || isNaN(end)) { console.log(chalk.red('Format tidak valid.')); return askNext(() => utilityMenu()); }

        console.log(chalk.cyan(`\n[*] Memindai port ${start} - ${end}...`));
        let promises = [];
        const checkPort = (port) => new Promise((resolve) => {
            const socket = new net.Socket(); socket.setTimeout(100);
            socket.on('connect', () => { socket.destroy(); resolve(port); });
            socket.on('timeout', () => { socket.destroy(); resolve(null); });
            socket.on('error', () => { resolve(null); });
            socket.connect(port, '127.0.0.1');
        });
        for (let p = start; p <= end; p++) promises.push(checkPort(p));

        Promise.all(promises).then((results) => {
            const foundPorts = results.filter(p => p !== null);
            if (foundPorts.length === 0) { console.log(chalk.gray('Tidak ada port terbuka.')); return askNext(() => utilityMenu()); }
            console.log(chalk.green(`\n[+] Ditemukan ${foundPorts.length} port terbuka:`));
            foundPorts.forEach(p => console.log(`    - Port ${p}`));
            rl.question(chalk.yellow('\nMatikan proses Web Server? (y/n) [0 = Batal]: '), (ans) => {
                if (ans.toLowerCase() === 'y') {
                    try { execSync('pkill -9 -f "webserver.js" || true'); console.log(chalk.green('[+] Proses dimatikan.')); } catch(e) {}
                }
                askNext(() => utilityMenu());
            });
        });
    });
}

async function githubDownloader() {
    console.log(chalk.yellow('\n=== DOWNLOAD DARI GITHUB ==='));
    console.log('1. File Tunggal\n2. Clone Repo (Auto-Setup)\n0. Kembali');
    rl.question(chalk.cyan('\nPilih [0-2]: '), (choice) => {
        if (choice === '0') return utilityMenu();
        if (choice === '1') {
            rl.question('Raw URL [0 = Batal]: ', (url) => {
                if (url.trim() === '0') return utilityMenu();
                rl.question('Simpan sebagai [0 = Batal]: ', (name) => {
                    if (name.trim() === '0') return utilityMenu();
                    try { execSync(`curl -L -s -o "tools/${name}" "${url}"`); console.log(chalk.green('[*] Sukses!')); } catch (e) { console.log(chalk.red('[!] Gagal')); }
                    askNext(() => utilityMenu());
                });
            });
        } else if (choice === '2') {
            rl.question('Repo URL (.git) [0 = Batal]: ', (url) => {
                if (url.trim() === '0') return utilityMenu();
                rl.question('Nama folder [0 = Batal]: ', (folder) => {
                    if (folder.trim() === '0') return utilityMenu();
                    const repoName = folder || path.basename(url, '.git');
                    const targetPath = path.join(TOOLS_DIR, repoName);
                    console.log(chalk.yellow(`\n[*] Cloning ke tools/${repoName}...`));
                    try { 
                        execSync(`git clone "${url}" "${targetPath}"`, {stdio: 'inherit'}); 
                        console.log(chalk.green('[*] Clone Sukses!'));
                        if (fs.existsSync(path.join(targetPath, 'requirements.txt'))) { try { execSync('pip install -r requirements.txt', { cwd: targetPath, stdio: 'inherit' }); } catch(e) {} }
                        if (fs.existsSync(path.join(targetPath, 'package.json'))) { try { execSync('npm install', { cwd: targetPath, stdio: 'inherit' }); } catch(e) {} }
                    } catch (e) { console.log(chalk.red('[!] Gagal clone.')); }
                    askNext(() => utilityMenu());
                });
            });
        } else utilityMenu();
    });
}

function showSystemInfo() {
    console.log(chalk.yellow('\n=== SYSTEM ENVIRONMENT ==='));
    try {
        console.log(`Node.js : ${execSync('node -v').toString().trim()}`);
        console.log(`Python  : ${execSync('python -V 2>&1').toString().trim()}`);
        console.log(`Go      : ${execSync('go version 2>&1').toString().trim()}`);
    } catch (e) {}
    askNext(() => utilityMenu());
}

async function ejectUsb() {
    console.log(chalk.yellow('\n=== MATIKAN / EJECT USB ==='));
    try {
        console.log(chalk.cyan('[*] Sinkronisasi data (sync)...'));
        execSync('sync');
        console.log(chalk.green('[+] Data sudah di-sync.'));
        console.log(chalk.cyan('\n[ PETUNJUK MENCABUT USB ]'));
        console.log('1. Tutup aplikasi Termux ini sepenuhnya.');
        console.log('2. Tarik notifikasi / Buka Settings > Storage.');
        console.log('3. Eject USB.');
    } catch (error) {}
    askNext(() => utilityMenu());
}

function askNext(callback) { rl.question(chalk.gray('\n[0] Kembali / Enter...'), () => callback()); }

async function main() {
    await ui.showBanner();
    await ui.showMainMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-3]: '), (answer) => {
        console.log();
        switch(answer) {
            case '1': toolsMenu(); break;
            case '2': fileManagerMenu(); break;
            case '3': utilityMenu(); break;
            case '0': process.exit(0);
            default: console.log(chalk.red('Invalid!')); setTimeout(() => main(), 1000);
        }
    });
}

main();
