#!/data/data/com.termux/files/usr/bin/bash

# Pindah ke direktori tempat script ini berada
cd "$(dirname "$0")" || exit 1

# Cek Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js belum terinstall."
    exit 1
fi

# Cek index.js
if [ ! -f "index.js" ]; then
    echo "[!] index.js gak ada di folder USB."
    exit 1
fi

# Jalanin UI Node.js
node index.js
