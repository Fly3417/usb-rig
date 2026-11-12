const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT_DIR = process.cwd();
const LOG_FILE = path.join(ROOT_DIR, 'logs', 'webserver.log');

if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function writeLog(msg) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${msg}`;
    fs.appendFileSync(LOG_FILE, logLine + '\n');
}

const server = http.createServer((req, res) => {
    writeLog(`INCOMING: ${req.method} ${req.url}`);

    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        let html = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>USB RIG - Web File Manager</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; padding: 20px; margin: 0; }
                .container { max-width: 900px; margin: 0 auto; }
                h1 { color: #38bdf8; text-align: center; letter-spacing: 2px; }
                .path-bar { background: #1e293b; padding: 10px 15px; border-radius: 8px; margin-bottom: 20px; font-family: monospace; font-size: 14px; border: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
                .path-text { overflow-x: auto; white-space: nowrap; }
                .btn-sm { padding: 5px 10px; background: #38bdf8; border: none; color: #000; font-weight: bold; border-radius: 4px; cursor: pointer; font-size: 12px; }
                .btn-sm:hover { background: #0ea5e9; }
                .controls { display: flex; gap: 10px; margin-bottom: 15px; }
                .btn { padding: 10px 20px; background: #10b981; border: none; color: white; font-weight: bold; border-radius: 5px; cursor: pointer; flex: 1; }
                .btn:hover { background: #059669; }
                .btn-newfolder { background: #f59e0b; color: #000; }
                .btn-newfolder:hover { background: #d97706; }
                .dropzone { border: 3px dashed #38bdf8; border-radius: 15px; padding: 30px; margin: 20px 0; background: #1e293b; transition: all 0.3s; cursor: pointer; text-align: center; }
                .dropzone.dragover { background: #334155; border-color: #10b981; transform: scale(1.02); }
                .file-list { background: #1e293b; padding: 15px; border-radius: 10px; }
                .file-item { padding: 10px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; font-family: monospace; }
                .file-item:last-child { border-bottom: none; }
                .file-name { flex: 1; cursor: pointer; }
                .folder-item { color: #fbbf24; font-weight: bold; }
                .folder-item:hover { text-decoration: underline; }
                .action-btns { display: flex; gap: 5px; }
                .act-btn { padding: 4px 8px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold; }
                .act-edit { background: #3b82f6; color: white; }
                .act-rename { background: #f59e0b; color: black; }
                .act-delete { background: #ef4444; color: white; }
                .status { color: #fbbf24; margin-top: 10px; font-weight: bold; text-align: center; }
                
                /* Modal Edit */
                .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
                .modal-content { background: #1e293b; padding: 20px; border-radius: 10px; width: 80%; max-width: 600px; border: 1px solid #38bdf8; }
                textarea { width: 100%; height: 300px; background: #0f172a; color: #fff; border: 1px solid #334155; padding: 10px; font-family: monospace; border-radius: 5px; box-sizing: border-box; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>USB RIG - Web File Manager</h1>
                <div class="path-bar">
                    <div class="path-text" id="pathDisplay">/</div>
                    <button class="btn-sm" onclick="goUp()">⬆️ Up</button>
                </div>
                <div class="controls">
                    <button class="btn btn-newfolder" onclick="createFolder()">📁 Buat Folder Baru</button>
                    <button class="btn" onclick="refreshList()">🔄 Refresh</button>
                </div>
                <div class="dropzone" id="dropzone">
                    <h2>Drop File Here</h2>
                    <p>Upload file ke folder yang sedang dibuka</p>
                    <input type="file" id="fileInput" multiple style="display: none;">
                </div>
                <div id="status" class="status"></div>
                <div class="file-list">
                    <h3 style="margin-top:0;">Isi Folder:</h3>
                    <div id="files"><i>Loading...</i></div>
                </div>
            </div>

            <!-- Modal Edit File -->
            <div class="modal" id="editModal">
                <div class="modal-content">
                    <h3 id="editTitle">Edit File</h3>
                    <textarea id="editContent"></textarea>
                    <div style="margin-top: 10px; display: flex; gap: 10px;">
                        <button class="btn" onclick="saveFile()">💾 Simpan</button>
                        <button class="btn btn-newfolder" onclick="closeModal()">❌ Batal</button>
                    </div>
                </div>
            </div>

            <script>
                let currentPath = "/";
                let editingFilePath = "";
                const dropzone = document.getElementById('dropzone');
                const fileInput = document.getElementById('fileInput');
                const status = document.getElementById('status');
                const filesDiv = document.getElementById('files');
                const pathDisplay = document.getElementById('pathDisplay');
                const editModal = document.getElementById('editModal');
                const editContent = document.getElementById('editContent');
                const editTitle = document.getElementById('editTitle');

                function refreshList() {
                    filesDiv.innerHTML = '<i>Loading...</i>';
                    fetch('/list?path=' + encodeURIComponent(currentPath))
                        .then(res => res.json())
                        .then(data => {
                            filesDiv.innerHTML = '';
                            if(!data || data.length === 0) filesDiv.innerHTML = '<i>Folder kosong.</i>';
                            
                            // Render Folders
                            const folders = data.filter(i => i.type === 'dir');
                            folders.forEach(f => {
                                filesDiv.innerHTML += \`
                                <div class="file-item">
                                    <span class="file-name folder-item" onclick="enterFolder('\${f.name}')">📁 \${f.name}</span>
                                    <div class="action-btns">
                                        <button class="act-btn act-rename" onclick="renameItem('\${f.name}', true)">✏️ Rename</button>
                                        <button class="act-btn act-delete" onclick="deleteItem('\${f.name}', true)">🗑️ Hapus</button>
                                    </div>
                                </div>\`;
                            });

                            // Render Files
                            const files = data.filter(i => i.type === 'file');
                            files.forEach(f => {
                                filesDiv.innerHTML += \`
                                <div class="file-item">
                                    <span class="file-name">📄 \${f.name}</span>
                                    <div class="action-btns">
                                        <button class="act-btn act-edit" onclick="editItem('\${f.name}')">📝 Edit</button>
                                        <button class="act-btn act-rename" onclick="renameItem('\${f.name}', false)">✏️ Rename</button>
                                        <button class="act-btn act-delete" onclick="deleteItem('\${f.name}', false)">🗑️ Hapus</button>
                                    </div>
                                </div>\`;
                            });
                        })
                        .catch(err => filesDiv.innerHTML = '<span style="color:#ef4444">Gagal buka folder.</span>');
                }

                // Navigasi
                function enterFolder(folderName) {
                    currentPath = currentPath.endsWith('/') ? currentPath + folderName : currentPath + '/' + folderName;
                    updatePathUI(); refreshList();
                }
                function goUp() {
                    if (currentPath === '/' || currentPath === '') return;
                    let parts = currentPath.split('/').filter(p => p);
                    parts.pop(); currentPath = '/' + parts.join('/');
                    updatePathUI(); refreshList();
                }
                function updatePathUI() { pathDisplay.innerText = currentPath; }

                // Aksi File/Folder
                function editItem(fileName) {
                    editingFilePath = currentPath.endsWith('/') ? currentPath + fileName : currentPath + '/' + fileName;
                    editTitle.innerText = "Edit: " + fileName;
                    editContent.value = "Loading...";
                    editModal.style.display = 'flex';
                    
                    fetch('/edit?path=' + encodeURIComponent(editingFilePath))
                        .then(res => res.text())
                        .then(text => editContent.value = text)
                        .catch(err => editContent.value = "Gagal load file (mungkin binary).");
                }

                function saveFile() {
                    const formData = new FormData();
                    formData.append('path', editingFilePath);
                    formData.append('content', editContent.value);
                    
                    fetch('/edit', { method: 'POST', body: formData })
                        .then(res => res.text())
                        .then(msg => { status.innerText = msg; closeModal(); })
                        .catch(err => status.innerText = 'Gagal simpan file.');
                }

                function closeModal() { editModal.style.display = 'none'; }

                function renameItem(name, isFolder) {
                    const newName = prompt("Masukkan nama baru:", name);
                    if (!newName || newName === name) return;
                    
                    const formData = new FormData();
                    formData.append('type', isFolder ? 'dir' : 'file');
                    formData.append('oldName', name);
                    formData.append('newName', newName);
                    formData.append('currentPath', currentPath);

                    fetch('/rename', { method: 'POST', body: formData })
                        .then(res => res.text())
                        .then(msg => { status.innerText = msg; refreshList(); })
                        .catch(err => status.innerText = 'Gagal rename.');
                }

                function deleteItem(name, isFolder) {
                    if (!confirm("Yakin hapus " + name + "?")) return;
                    
                    const formData = new FormData();
                    formData.append('type', isFolder ? 'dir' : 'file');
                    formData.append('name', name);
                    formData.append('currentPath', currentPath);

                    fetch('/delete', { method: 'POST', body: formData })
                        .then(res => res.text())
                        .then(msg => { status.innerText = msg; refreshList(); })
                        .catch(err => status.innerText = 'Gagal hapus.');
                }

                function createFolder() {
                    const name = prompt("Masukkan nama folder baru:");
                    if (!name) return;
                    const formData = new FormData();
                    formData.append('action', 'mkdir');
                    formData.append('folderName', name);
                    formData.append('currentPath', currentPath);
                    fetch('/action', { method: 'POST', body: formData })
                        .then(res => res.text())
                        .then(msg => { status.innerText = msg; refreshList(); })
                        .catch(err => status.innerText = 'Gagal buat folder.');
                }

                // Upload
                dropzone.addEventListener('click', () => fileInput.click());
                dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
                dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
                dropzone.addEventListener('drop', (e) => {
                    e.preventDefault(); dropzone.classList.remove('dragover');
                    handleFiles(e.dataTransfer.files);
                });
                fileInput.addEventListener('change', () => handleFiles(fileInput.files));
                function handleFiles(files) { for (let i = 0; i < files.length; i++) uploadFile(files[i]); }

                function uploadFile(file) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('currentPath', currentPath);
                    status.innerText = 'Uploading ' + file.name + '...';
                    fetch('/upload', { method: 'POST', body: formData })
                        .then(res => res.text())
                        .then(msg => { status.innerText = msg; refreshList(); })
                        .catch(err => status.innerText = 'Upload Gagal!');
                }
                
                updatePathUI(); refreshList();
            </script>
        </body>
        </html>
        `;
        res.end(html);
    } 
    else if (req.method === 'GET' && req.url.startsWith('/list')) {
        const parsedUrl = new URL(req.url, 'http://' + req.headers.host);
        let reqPath = parsedUrl.searchParams.get('path') || '/';
        const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
        const targetDir = path.join(ROOT_DIR, safePath);

        if (!targetDir.startsWith(ROOT_DIR) || !fs.existsSync(targetDir)) {
            res.writeHead(400); return res.end(JSON.stringify([]));
        }
        try {
            const items = fs.readdirSync(targetDir, { withFileTypes: true });
            const results = items.map(item => ({ name: item.name, type: item.isDirectory() ? 'dir' : 'file' }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify([])); }
    }
    else if (req.method === 'GET' && req.url.startsWith('/edit')) {
        const parsedUrl = new URL(req.url, 'http://' + req.headers.host);
        let reqPath = parsedUrl.searchParams.get('path') || '/';
        const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
        const targetFile = path.join(ROOT_DIR, safePath);

        if (!targetFile.startsWith(ROOT_DIR) || !fs.existsSync(targetFile)) {
            res.writeHead(404); return res.end('File not found');
        }
        try {
            const content = fs.readFileSync(targetFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(content);
        } catch (e) { res.writeHead(500); res.end('Cannot read file'); }
    }
    else if (req.method === 'POST' && req.url === '/edit') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body).toString('binary');
            const boundary = req.headers['content-type'].split('boundary=')[1];
            const parts = buffer.split('--' + boundary);
            
            let filePath = '', content = '';
            parts.forEach(part => {
                if (part.includes('name="path"')) filePath = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '';
                if (part.includes('name="content"')) content = part.split('\r\n\r\n')[1]?.slice(0, -2) || ''; 
            });

            const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
            const targetFile = path.join(ROOT_DIR, safePath);

            if (targetFile.startsWith(ROOT_DIR)) {
                try {
                    fs.writeFileSync(targetFile, content, 'utf8');
                    writeLog(`EDIT: Saved changes to ${safePath}`);
                    res.end('Sukses! File disimpan.');
                } catch (e) { res.end('Gagal simpan file.'); }
            } else { res.end('Path tidak valid.'); }
        });
    }
    else if (req.method === 'POST' && req.url === '/rename') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body).toString('binary');
            const boundary = req.headers['content-type'].split('boundary=')[1];
            const parts = buffer.split('--' + boundary);
            
            let oldName = '', newName = '', reqPath = '/', type = 'file';
            parts.forEach(part => {
                if (part.includes('name="oldName"')) oldName = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '';
                if (part.includes('name="newName"')) newName = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '';
                if (part.includes('name="currentPath"')) reqPath = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '/';
                if (part.includes('name="type"')) type = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || 'file';
            });

            const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
            const oldFullPath = path.join(ROOT_DIR, safePath, oldName);
            const newFullPath = path.join(ROOT_DIR, safePath, newName);

            if (oldFullPath.startsWith(ROOT_DIR) && newFullPath.startsWith(ROOT_DIR)) {
                try {
                    fs.renameSync(oldFullPath, newFullPath);
                    writeLog(`RENAME: ${oldName} -> ${newName}`);
                    res.end('Sukses! Berhasil direname.');
                } catch (e) { res.end('Gagal rename: ' + e.message); }
            } else { res.end('Path tidak valid.'); }
        });
    }
    else if (req.method === 'POST' && req.url === '/delete') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body).toString('binary');
            const boundary = req.headers['content-type'].split('boundary=')[1];
            const parts = buffer.split('--' + boundary);
            
            let name = '', reqPath = '/', type = 'file';
            parts.forEach(part => {
                if (part.includes('name="name"')) name = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '';
                if (part.includes('name="currentPath"')) reqPath = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '/';
                if (part.includes('name="type"')) type = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || 'file';
            });

            const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
            const targetPath = path.join(ROOT_DIR, safePath, name);

            if (targetPath.startsWith(ROOT_DIR)) {
                try {
                    if (type === 'dir') {
                        fs.rmdirSync(targetPath, { recursive: true });
                    } else {
                        fs.unlinkSync(targetPath);
                    }
                    writeLog(`DELETE: ${name}`);
                    res.end('Sukses! ' + name + ' dihapus.');
                } catch (e) { res.end('Gagal hapus: ' + e.message); }
            } else { res.end('Path tidak valid.'); }
        });
    }
    else if (req.method === 'POST' && req.url === '/action') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body).toString('binary');
            const boundary = req.headers['content-type'].split('boundary=')[1];
            const parts = buffer.split('--' + boundary);
            let folderName = '', reqPath = '/';

            parts.forEach(part => {
                if (part.includes('name="folderName"')) folderName = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '';
                if (part.includes('name="currentPath"')) reqPath = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '/';
            });

            if (folderName) {
                const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
                const targetDir = path.join(ROOT_DIR, safePath, folderName);
                if (targetDir.startsWith(ROOT_DIR)) {
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                        writeLog(`MKDIR: Created /${safePath}/${folderName}`);
                        res.end('Sukses! Folder dibuat.');
                    } else res.end('Folder sudah ada.');
                } else res.end('Path tidak valid.');
            } else res.end('Aksi tidak dikenal.');
        });
    }
    else if (req.method === 'POST' && req.url === '/upload') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body).toString('binary');
            const boundary = req.headers['content-type'].split('boundary=')[1];
            const parts = buffer.split('--' + boundary);
            let uploadedName = '', reqPath = '/';

            parts.forEach(part => {
                if (part.includes('name="currentPath"')) reqPath = part.split('\r\n\r\n')[1]?.split('\r\n')[0] || '/';
                const nameMatch = part.match(/filename="(.+)"/);
                if (nameMatch && nameMatch[1]) {
                    const filename = nameMatch[1];
                    const fileStart = part.indexOf('\r\n\r\n') + 4;
                    const fileEnd = part.lastIndexOf('\r\n');
                    const fileData = Buffer.from(part.substring(fileStart, fileEnd), 'binary');
                    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
                    const targetDir = path.join(ROOT_DIR, safePath);
                    if (targetDir.startsWith(ROOT_DIR) && fs.existsSync(targetDir)) {
                        fs.writeFileSync(path.join(targetDir, filename), fileData);
                        uploadedName = filename;
                        writeLog(`UPLOAD: ${filename} -> /${safePath}/`);
                    }
                }
            });
            if (uploadedName) res.end('Sukses! ' + uploadedName + ' berhasil diupload.');
            else res.end('Upload gagal atau folder tidak valid.');
        });
    }
    else { res.writeHead(404); res.end('Not Found'); }
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = Object.values(require('os').networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1';
    writeLog(`[+] Universal Web File Manager AKTIF di http://${ip}:${PORT}`);
});
