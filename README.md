# Kasir Toko — Frontend (GitHub Pages)

Frontend statis. Backend: Google Apps Script (REST API JSON).

## Struktur (jangan diratakan)
```
index.html
css/style.css
js/config.js   <- isi GAS_URL di sini
js/app.js
```

## Sebelum push pertama
Buka `js/config.js`, ganti nilai `GAS_URL` dengan URL Web App (berakhiran `/exec`).

## Update
```
git add .
git commit -m "Deskripsi perubahan"
git push
```
Bila tampilan tidak berubah: Ctrl + Shift + R.
