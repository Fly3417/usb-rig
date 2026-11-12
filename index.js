const readline = require('readline');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');
const ui = require('./ui.js');
const { loadConfig, saveConfig } = require('./config.js');
const { encryptFile, encryptFolder, decryptFile, decryptFolder } = require('./crypto-helper.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

process.on('SIGINT', () => {
    console.log(chalk.red('\n\n[!] Dibatalkan oleh user (CTRL+C). Keluar...'));
    process.exit(0);
});

const USB_PATH = process.cwd();
const TOOLS_DIR = path.join(USB_PATH, 'tools');
const PAYLOAD_DIR = path.join(USB_PATH, 'payloads');
const LOG_DIR = path.join(USB_PATH, 'logs');
const CACHE_DIR = path.join(process.env.HOME || '/data/data/com.termux/files/home', '.usb_rig_cache');

let cfg = loadConfig();
if (!cfg.workDir) cfg.workDir = USB_PATH;
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function findFileRecursive(dir, targetFileName) {
    let results = [];
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.name === 'node_modules' || item.name === '.git') continue;
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) results = results.concat(findFileRecursive(fullPath, targetFileName));
            else if (item.name === targetFileName) results.push(fullPath);
        }
    } catch (e) {}
    return results;
}

function executeFile(filePath, returnCallback) {
    let ext = path.extname(filePath).toLowerCase();
    let fileName = path.basename(filePath);
    let actualPath = filePath;

    if (ext === '.enc') {
        rl.question(chalk.yellow(`\n🔒 File terenkripsi. Masukkan password [0 = Batal]: `), (pass) => {
            if (pass.trim() === '0') return returnCallback();
            
            const isFolder = fileName.endsWith('.tar.gz.enc');
            
            if (isFolder) {
                console.log(chalk.cyan('[*] Mendeteksi brankas folder. Mengekstrak...'));
                const extractPath = path.dirname(filePath);
                const res = decryptFolder(filePath, pass, extractPath);
                if (!res.success) {
                    console.log(chalk.red(`[!] ${res.message}`));
                    return askNext(returnCallback);
                }
                console.log(chalk.green(`[*] Sukses diekstrak ke folder asal. Silakan buka foldernya.`));
                return askNext(returnCallback);
            } else {
                const tempDecryptPath = path.join(CACHE_DIR, fileName.replace('.enc', ''));
                const result = decryptFile(filePath, pass, tempDecryptPath);
                if (!result.success) {
                    console.log(chalk.red(`[!] ${result.message}`));
                    return askNext(returnCallback);
                }
                console.log(chalk.green(`[*] Password benar. File dibuka sementara.`));
                runCommand(tempDecryptPath, fileName.replace('.enc', ''), returnCallback);
            }
        });
    } else {
        runCommand(actualPath, fileName, returnCallback);
    }
}

function runCommand(actualPath, fileName, returnCallback) {
    const ext = path.extname(actualPath).toLowerCase();
    let command = '';

    if (ext === '.js') command = `node "${actualPath}"`;
    else if (ext === '.py') command = `python "${actualPath}"`;
    else if (ext === '.sh' || ext === '.bash') command = `bash "${actualPath}"`;
    else {
        const cachedPath = path.join(CACHE_DIR, fileName);
        fs.copyFileSync(actualPath, cachedPath);
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

async function fileActionMenu(filePath, returnCallback) {
    const fileName = path.basename(filePath);
    await ui.showFileActionMenu(fileName);

    rl.question(chalk.cyan('  └─> Pilih aksi [0-5]: '), (answer) => {
        console.log();
        switch(answer) {
            case '1': executeFile(filePath, returnCallback); break;
            case '2': viewEditFile(filePath, returnCallback); break;
            case '3': renameFile(filePath, returnCallback); break;
            case '4': deleteFile(filePath, returnCallback); break;
            case '5': encryptAction(filePath, returnCallback); break;
            case '0': returnCallback(); break;
            default: setTimeout(() => fileActionMenu(filePath, returnCallback), 1000);
        }
    });
}

async function folderActionMenu(folderPath, returnCallback) {
    const folderName = path.basename(folderPath);
    await ui.showFolderActionMenu(folderName);

    rl.question(chalk.cyan('  └─> Pilih aksi [0-4]: '), (answer) => {
        console.log();
        switch(answer) {
            case '1': usbExplorer(folderPath, `FOLDER: ${folderName}`, returnCallback); break;
            case '2': renameFolder(folderPath, returnCallback); break;
            case '3': deleteFolder(folderPath, returnCallback); break;
            case '4': encryptFolderAction(folderPath, returnCallback); break;
            case '0': returnCallback(); break;
            default: setTimeout(() => folderActionMenu(folderPath, returnCallback), 1000);
        }
    });
}

function encryptAction(filePath, returnCallback) {
    if (filePath.endsWith('.enc')) return console.log(chalk.red('[!] File sudah terenkripsi.')), askNext(returnCallback);
    rl.question(chalk.yellow(`🔒 Masukkan password [0 = Batal]: `), (pass) => {
        if (pass.trim() === '0') return askNext(returnCallback);
        if (pass.length < 4) return console.log(chalk.red('[!] Min 4 karakter.')), askNext(returnCallback);
        
        const res = encryptFile(filePath, pass);
        if (res.success) console.log(chalk.green(`[*] Sukses diamankan sebagai ${path.basename(res.path)}`));
        else console.log(chalk.red(`[!] Gagal: ${res.message}`));
        askNext(returnCallback);
    });
}

function encryptFolderAction(folderPath, returnCallback) {
    rl.question(chalk.yellow(`🔒 Masukkan password untuk folder ini [0 = Batal]: `), (pass) => {
        if (pass.trim() === '0') return askNext(returnCallback);
        if (pass.length < 4) return console.log(chalk.red('[!] Min 4 karakter.')), askNext(returnCallback);
        
        const res = encryptFolder(folderPath, pass);
        if (res.success) console.log(chalk.green(`[*] Sukses! Folder dijadikan brankas: ${path.basename(res.path)}`));
        else console.log(chalk.red(`[!] Gagal: ${res.message}`));
        askNext(returnCallback);
    });
}

function viewEditFile(filePath, returnCallback) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(chalk.cyan('\n=== INTERNAL EDITOR ==='));
        console.log(chalk.gray('(Mode Read-Only)'));
        console.log(chalk.gray('--------------------------------------------------'));
        console.log(content);
        console.log(chalk.gray('--------------------------------------------------'));
    } catch (err) { console.log(chalk.red(`[!] File binary atau tidak bisa dibaca.`)); }
    askNext(returnCallback);
}

function renameFile(filePath, returnCallback) {
    rl.question(chalk.cyan('Masukkan nama baru [0 = Batal]: '), (newName) => {
        if (!newName || newName.trim() === '0') { console.log(chalk.gray('Batal.')); return askNext(returnCallback); }
        try { fs.renameSync(filePath, path.join(path.dirname(filePath), newName)); console.log(chalk.green(`[*] Sukses di-rename.`)); } 
        catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        askNext(returnCallback);
    });
}

function renameFolder(folderPath, returnCallback) {
    rl.question(chalk.cyan('Masukkan nama folder baru [0 = Batal]: '), (newName) => {
        if (!newName || newName.trim() === '0') { console.log(chalk.gray('Batal.')); return askNext(returnCallback); }
        try { fs.renameSync(folderPath, path.join(path.dirname(folderPath), newName)); console.log(chalk.green(`[*] Sukses di-rename.`)); } 
        catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        askNext(returnCallback);
    });
}

function deleteFile(filePath, returnCallback) {
    rl.question(chalk.red('Yakin mau hapus? (y/n) [0 = Batal]: '), (ans) => {
        if (ans.trim() === '0') return askNext(returnCallback);
        if (ans.toLowerCase() === 'y') {
            try { fs.unlinkSync(filePath); console.log(chalk.green(`[*] Dihapus.`)); } 
            catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        }
        askNext(returnCallback);
    });
}

function deleteFolder(folderPath, returnCallback) {
    rl.question(chalk.red('Yakin hapus folder ini beserta isinya? (y/n) [0 = Batal]: '), (ans) => {
        if (ans.trim() === '0') return askNext(returnCallback);
        if (ans.toLowerCase() === 'y') {
            try { fs.rmSync(folderPath, { recursive: true, force: true }); console.log(chalk.green(`[*] Folder dihapus.`)); } 
            catch (e) { console.log(chalk.red(`[!] Gagal: ${e.message}`)); }
        }
        askNext(returnCallback);
    });
}

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

        folders.forEach(f => {
            console.log(`  ${chalk.cyan(`[${index}]`)} 📁 ${chalk.yellow(f.name + '/')}`);
            itemList.push({ type: 'dir', name: f.name, path: path.join(currentPath, f.name) });
            index++;
        });

        files.forEach(f => {
            console.log(`  ${chalk.cyan(`[${index}]`)} 📄 ${f.name}`);
            itemList.push({ type: 'file', name: f.name, path: path.join(currentPath, f.name) });
            index++;
        });

        if (itemList.length === 0) console.log(chalk.red('  (Folder kosong)'));

        console.log(chalk.gray('\n  [N] Buat Folder Baru'));
        if (currentPath !== USB_PATH) console.log(chalk.gray('  [B] Kembali ke folder atas'));
        console.log(chalk.gray('  [0] Kembali / Batal'));

        rl.question(chalk.cyan(`\n  Pilih nomor [0-${itemList.length}, N, B]: `), (ans) => {
            if (ans === '0') return returnCallback();
            if (ans.toUpperCase() === 'B') {
                if (currentPath !== USB_PATH) return usbExplorer(path.dirname(currentPath), title, returnCallback);
                return usbExplorer(currentPath, title, returnCallback);
            }
            if (ans.toUpperCase() === 'N') {
                rl.question(chalk.cyan('  Masukkan nama folder baru [0 = Batal]: '), (folderName) => {
                    if (folderName.trim() === '0') return usbExplorer(currentPath, title, returnCallback);
                    try {
                        const newPath = path.join(currentPath, folderName);
                        if (!fs.existsSync(newPath)) fs.mkdirSync(newPath), console.log(chalk.green(`  [+] Folder dibuat.`));
                        else console.log(chalk.red('  [!] Folder sudah ada.'));
                    } catch (e) { console.log(chalk.red(`  [!] Gagal: ${e.message}`)); }
                    usbExplorer(currentPath, title, returnCallback);
                });
                return;
            }
            const idx = parseInt(ans) - 1;
            if (idx >= 0 && idx < itemList.length) {
                const selected = itemList[idx];
                if (selected.type === 'dir') {
                    folderActionMenu(selected.path, () => usbExplorer(currentPath, title, returnCallback));
                } else {
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

async function toolsMenu() {
    await ui.showToolsMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-2]: '), (answer) => {
        if (answer === '1') {
            usbExplorer(TOOLS_DIR, 'TOOLS ARSENAL', () => toolsMenu());
        } else if (answer === '2') {
            rl.question(chalk.yellow('\n[*] Masukkan perintah (contoh: node dummy.js) [0 = Batal]: '), (cmd) => {
                if (cmd.trim() === '0') return toolsMenu();
                
                const parts = cmd.trim().split(/\s+/);
                const commandExec = parts[0];
                const targetFile = parts[1];
                const restArgs = parts.slice(2).join(' ');

                if (!targetFile || !targetFile.includes('.')) {
                    console.log(chalk.green(`\n[*] Menjalankan: ${cmd}\n`));
                    try { execSync(cmd, { stdio: 'inherit', shell: '/data/data/com.termux/files/usr/bin/bash' }); } catch (e) {}
                    return askNext(() => toolsMenu());
                }

                console.log(chalk.cyan(`[*] Mencari file "${targetFile}" di seluruh USB...`));
                const foundFiles = findFileRecursive(USB_PATH, targetFile);

                if (foundFiles.length === 0) {
                    console.log(chalk.red(`[!] File "${targetFile}" tidak ditemukan.`));
                    return askNext(() => toolsMenu());
                }

                const targetPath = foundFiles[0];
                const targetDir = path.dirname(targetPath);
                
                console.log(chalk.green(`[*] Ditemukan di: ${path.relative(USB_PATH, targetPath)}`));
                console.log(chalk.green(`[*] Menjalankan: ${commandExec} ${targetFile} ${restArgs}\n`));

                try { 
                    execSync(`${commandExec} "${targetFile}" ${restArgs}`, { 
                        cwd: targetDir, 
                        stdio: 'inherit', 
                        shell: '/data/data/com.termux/files/usr/bin/bash' 
                    }); 
                } catch (e) {}
                
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
                } catch (e) { console.log(chalk.red(`\n  [!] Gagal copy: ${e.message}`)); }
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

async function utilityMenu() {
    await ui.showUtilityMenu();
    rl.question(chalk.cyan('  └─> Pilih menu [0-9]: '), (answer) => {
        switch(answer) {
            case '1': showSystemInfo(); break;
            case '2': githubDownloader(); break;
            case '3': ejectUsb(); break;
            case '4': webServerMenu(); break;
            case '5': portScanner(); break;
            case '6': checkBattery(); break;
            case '7': updateSystem(); break;
            case '8': backupSystem(); break;
            case '9': changeLanguage(); break;
            case '0': main(); break;
            default: setTimeout(() => utilityMenu(), 1000);
        }
    });
}

async function changeLanguage() {
    console.log(chalk.yellow('\n=== GANTI BAHASA / CHANGE LANGUAGE ==='));
    console.log('1. Indonesia');
    console.log('2. English');
    console.log('0. Kembali');
    
    rl.question(chalk.cyan('\nPilih / Select [0-2]: '), (ans) => {
        if (ans === '0') return utilityMenu();
        if (ans === '1' || ans === '2') {
            cfg.lang = ans === '1' ? 'id' : 'en';
            saveConfig(cfg);
            
            try {
                const configPath = path.join(USB_PATH, 'config.json');
                const rawConfig = fs.readFileSync(configPath, 'utf8');
                const jsonConfig = JSON.parse(rawConfig);
                jsonConfig.lang = cfg.lang;
                fs.writeFileSync(configPath, JSON.stringify(jsonConfig, null, 2));
            } catch (e) {}
            
            console.log(chalk.green(`\n[*] Bahasa diubah ke: ${cfg.lang === 'id' ? 'Indonesia' : 'English'}`));
            askNext(() => main());
        } else {
            utilityMenu();
        }
    });
}

async function checkBattery() {
    console.log(chalk.yellow('\n=== STATUS BATERAI ==='));
    try {
        const bat = JSON.parse(execSync('termux-battery-status').toString());
        console.log(chalk.white(`  Level    : ${chalk.green(bat.percentage + '%')}`));
        console.log(chalk.white(`  Status   : ${chalk.cyan(bat.status)}`));
        console.log(chalk.white(`  Suhu     : ${chalk.yellow(bat.temperature + '°C')}`));
        console.log(chalk.white(`  Kesehatan: ${chalk.green(bat.health)}`));
    } catch (e) {
        console.log(chalk.red(`  [!] Gagal membaca baterai. Pastikan Termux:API terinstall.`));
    }
    askNext(() => utilityMenu());
}

async function githubDownloader() {
    console.log(chalk.yellow('\n=== SMART GITHUB INSTALLER ==='));
    rl.question(chalk.cyan('Masukkan URL Repo GitHub (.git) [0 = Batal]: '), (url) => {
        if (url.trim() === '0') return utilityMenu();
        rl.question(chalk.cyan('Nama folder (kosongkan untuk default) [0 = Batal]: '), (folder) => {
            if (folder.trim() === '0') return utilityMenu();
            const repoName = folder || path.basename(url, '.git');
            const targetPath = path.join(TOOLS_DIR, repoName);
            
            console.log(chalk.yellow(`\n[*] Cloning repo ke tools/${repoName}...`));
            try { 
                execSync(`git clone "${url}" "${targetPath}"`, {stdio: 'inherit'}); 
                console.log(chalk.green('[*] Clone Sukses! Semua file dan folder telah diunduh.'));
                
                console.log(chalk.cyan('\n[*] Menganalisis isi repository (Auto-Detect)...'));
                let installCmd = null;
                if (fs.existsSync(path.join(targetPath, 'requirements.txt'))) installCmd = 'pip install -r requirements.txt';
                else if (fs.existsSync(path.join(targetPath, 'package.json'))) installCmd = 'npm install';
                else if (fs.existsSync(path.join(targetPath, 'setup.sh'))) installCmd = 'bash setup.sh';
                else if (fs.existsSync(path.join(targetPath, 'install.sh'))) installCmd = 'bash install.sh';

                let readmeContent = '';
                const readmePath = path.join(targetPath, 'README.md');
                if (fs.existsSync(readmePath)) readmeContent = fs.readFileSync(readmePath, 'utf8');

                console.log(chalk.cyan.bold('\n  +--------------------------------------------------------+'));
                console.log(chalk.cyan.bold('  |') + chalk.white.bold('                   SMART REPO ANALYSIS                  ') + chalk.cyan.bold('|'));
                console.log(chalk.cyan.bold('  +--------------------------------------------------------+'));
                
                if (installCmd) console.log(chalk.green(`  [1] INSTALL : Terdeteksi otomatis (${installCmd})`));
                else console.log(chalk.yellow(`  [1] INSTALL : Tidak ada dependensi khusus yang terdeteksi.`));

                let usageSnippet = 'Lihat README.md untuk cara pakai.';
                const usageMatch = readmeContent.match(/##\s+(Usage|Cara Pakai|How to use)([\s\S]*?)(?=##|$)/i);
                if (usageMatch) usageSnippet = usageMatch[2].trim().substring(0, 150) + '...';
                
                console.log(chalk.white(`\n  [2] USAGE   :`));
                console.log(chalk.gray(`      ${usageSnippet.replace(/\n/g, '\n      ')}`));

                console.log(chalk.green(`\n  [3] EXECUTE : Buka folder untuk menjalankan tool.`));
                console.log(chalk.gray(`  [0] Selesai / Batal`));
                console.log(chalk.cyan.bold('  +--------------------------------------------------------+'));

                rl.question(chalk.cyan('\n  Pilih aksi [0-3]: '), (action) => {
                    if (action === '1') {
                        if (installCmd) {
                            console.log(chalk.green(`\n[*] Menjalankan Auto-Install: ${installCmd}`));
                            try { execSync(installCmd, { cwd: targetPath, stdio: 'inherit' }); console.log(chalk.green('[*] Instalasi Selesai!')); } catch(e) { console.log(chalk.red('[!] Instalasi gagal.')); }
                        } else console.log(chalk.yellow('\n[*] Tidak ada perintah install otomatis.'));
                        askNext(() => utilityMenu());
                    } else if (action === '2') {
                        console.log(chalk.cyan(`\n=== ISI README.md ===\n`));
                        console.log(chalk.white(readmeContent.substring(0, 500) + '\n\n... (potongan teks)'));
                        console.log(chalk.gray('\n(Untuk melihat lengkap, buka lewat File Manager)'));
                        askNext(() => utilityMenu());
                    } else if (action === '3') {
                        usbExplorer(targetPath, `REPO: ${repoName}`, () => utilityMenu());
                    } else utilityMenu();
                });

            } catch (e) { 
                console.log(chalk.red('[!] Gagal clone repo. Pastikan URL benar dan koneksi stabil.')); 
                askNext(() => utilityMenu());
            }
        });
    });
}

async function updateSystem() {
    console.log(chalk.yellow('\n=== UPDATE SYSTEM (GET) ==='));
    console.log(chalk.cyan('[*] Menarik update terbaru dari GitHub...'));
    
    try {
        execSync('git stash', { cwd: USB_PATH, stdio: 'inherit' });
        execSync('git pull origin main', { cwd: USB_PATH, stdio: 'inherit' });
        execSync('git stash pop', { cwd: USB_PATH, stdio: 'inherit' });
        
        console.log(chalk.green('\n[*] Kode berhasil diupdate!'));
        console.log(chalk.cyan('[*] Memperbarui library Node.js...'));
        execSync('npm install', { cwd: USB_PATH, stdio: 'inherit' });
        console.log(chalk.green('[*] Library selesai diupdate!'));
        console.log(chalk.yellow('\n[!] Folder tools/ dan payloads/ AMAN.'));
        askNext(() => utilityMenu());
    } catch (e) {
        console.log(chalk.red(`\n[!] Gagal update: ${e.message}`));
        askNext(() => utilityMenu());
    }
}

async function backupSystem() {
    console.log(chalk.yellow('\n=== BACKUP SYSTEM (POST) ==='));
    console.log(chalk.gray('[*] Mengecek perubahan pada folder USB RIG...'));
    
    try {
        const status = execSync('git status --porcelain', { cwd: USB_PATH }).toString().trim();
        if (!status) {
            console.log(chalk.yellow('[!] Tidak ada perubahan file yang perlu di-upload.'));
            return askNext(() => utilityMenu());
        }

        console.log(chalk.cyan('\n[*] File yang berubah:'));
        console.log(chalk.white(status));

        rl.question(chalk.yellow('\nMasukkan pesan commit [Enter = Auto-commit]: '), (msg) => {
            const commitMsg = msg.trim() || `Auto-commit from USB RIG (${new Date().toLocaleString()})`;
            
            try {
                console.log(chalk.cyan('\n[*] Menambahkan file ke Git...'));
                execSync('git add .', { cwd: USB_PATH, stdio: 'inherit' });

                console.log(chalk.cyan('[*] Membuat commit...'));
                execSync(`git commit -m "${commitMsg}"`, { cwd: USB_PATH, stdio: 'inherit' });

                console.log(chalk.cyan('[*] Meng-upload (push) ke GitHub...'));
                execSync('git push origin main', { cwd: USB_PATH, stdio: 'inherit' });

                console.log(chalk.green('\n[*] SUKSES! Perubahan berhasil di-backup ke GitHub.'));
                askNext(() => utilityMenu());
            } catch (e) {
                console.log(chalk.red(`\n[!] Gagal upload: ${e.message}`));
                askNext(() => utilityMenu());
            }
        });
    } catch (e) {
        console.log(chalk.red(`\n[!] Error Git: ${e.message}`));
        askNext(() => utilityMenu());
    }
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
