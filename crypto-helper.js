const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptFile(filePath, password, isDeleteOriginal = true) {
    try {
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, salt, 32);
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        const fileData = fs.readFileSync(filePath);
        const encrypted = Buffer.concat([cipher.update(fileData), cipher.final()]);
        const tag = cipher.getAuthTag();
        
        const result = Buffer.concat([salt, iv, tag, encrypted]);
        
        const encPath = filePath + '.enc';
        fs.writeFileSync(encPath, result);
        if (isDeleteOriginal) fs.unlinkSync(filePath);
        
        return { success: true, path: encPath };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

function encryptFolder(folderPath, password) {
    try {
        const parentDir = path.dirname(folderPath);
        const folderName = path.basename(folderPath);
        const tarPath = path.join(parentDir, `${folderName}.tar.gz`);
        
        console.log(`[*] Mengompres folder menjadi ${folderName}.tar.gz...`);
        execSync(`tar -czf "${tarPath}" -C "${parentDir}" "${folderName}"`, { stdio: 'inherit' });
        
        console.log(`[*] Mengenkripsi brankas...`);
        const res = encryptFile(tarPath, password, true);
        
        if (res.success) {
            console.log(`[*] Menghapus folder asli...`);
            execSync(`rm -rf "${folderPath}"`);
            return { success: true, path: res.path };
        }
        return res;
    } catch (e) {
        return { success: false, message: e.message };
    }
}

function decryptFile(encPath, password, outputPath) {
    try {
        const fileData = fs.readFileSync(encPath);
        
        const salt = fileData.subarray(0, 16);
        const iv = fileData.subarray(16, 28);
        const tag = fileData.subarray(28, 44);
        const encrypted = fileData.subarray(44);
        
        const key = crypto.scryptSync(password, salt, 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        
        const finalPath = outputPath || encPath.replace('.enc', '');
        fs.writeFileSync(finalPath, decrypted);
        
        return { success: true, path: finalPath };
    } catch (e) {
        return { success: false, message: 'Password salah atau file corrupt!' };
    }
}

function decryptFolder(encPath, password, extractPath) {
    try {
        console.log(`[*] Mendekripsi brankas...`);
        const tarPath = encPath.replace('.enc', '');
        const res = decryptFile(encPath, password, tarPath);
        if (!res.success) return res;

        console.log(`[*] Mengekstrak isi folder...`);
        execSync(`tar -xzf "${tarPath}" -C "${extractPath}"`, { stdio: 'inherit' });
        fs.unlinkSync(tarPath);
        
        return { success: true };
    } catch (e) {
        return { success: false, message: 'Gagal ekstrak folder. Password salah?' };
    }
}

module.exports = { encryptFile, encryptFolder, decryptFile, decryptFolder };
