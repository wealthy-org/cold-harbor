# UX polish app pages (todo)

Tujuan: app page (`/app/*`, `/mm`) terasa premium seperti landing. Aturan anti-slop tetap berlaku: tanpa glass, gradient, hover bergerak, em dash, Geist/Inter, ikon stok. Font Instrument Sans + JetBrains Mono, amber `signal-500 #FFB020`, ink gelap.

Status: stepper Approve/Execute/Settled di `TradeClient.tsx` sudah diganti (belum di-commit). Sisanya di bawah belum dikerjakan.

## Putaran 1: halaman Trade
- [ ] **1. Hierarki angka.** Harga best quote dan jumlah diterima besar (40-48px, JetBrains Mono, tabular). Ringkasan quote jadi blok receipt: garis tipis, angka rata kanan.
- [ ] **2. Quote Room.** Best quote diberi marker amber di sisi kiri. Countdown jadi bar tipis yang menyusut di tepi atas kartu. Maker yang belum merespons tampil skeleton, quote masuk dengan fade pendek. Spread bps rata kanan di kolom sendiri.
- [ ] **4. Header dan navigasi.** Chip wallet dengan titik status jaringan ("Testnet 46630") dan saldo USDG. Tab aktif dengan garis bawah amber. Footer status tipis: block terakhir, status relay (live/offline), label testnet.

## Putaran 2: semua halaman
- [ ] **3. Ritme dan kerapatan.** Skala spasi tetap 8/16/24/40. Panel dipisah garis 1px dan beda lapisan (`ink-900` di atas `ink-950`), bukan border semua sisi. Batasi lebar konten dan kecilkan header halaman.
- [ ] **5. State kosong dan loading.** Skeleton untuk "Your Fills" dan data loading. Tombol disabled diberi alasan di bawahnya ("Connect wallet", "Quote expired").
- [ ] **6. Detail kecil.** Flash warna 300ms saat harga berubah (hijau naik, merah turun) dengan `tabular-nums`. Hash/alamat bisa disalin satu klik dengan toast. Shortcut keyboard untuk Request quotes dan Execute. Fokus ring amber konsisten.

## Putaran 3: per halaman
- [ ] **7a. Portfolio.** Kartu ringkasan PnL dengan angka besar di atas. Tabel header lengket, kolom angka rata kanan.
- [ ] **7b. Forwards.** Margin tampil sebagai bar rasio (margin vs required) dengan penanda batas likuidasi.
- [ ] **7c. `/mm`.** Tabel limit dengan bar pemakaian terhadap limit.

## Catatan
- Reload skill `web-ui-retheme-polish` sebelum mulai (aturan anti-slop lengkap).
- Data simulasi tetap harus berlabel.
- Cek `tsc` dan `eslint` sebelum commit, lalu lihat hasil di browser lewat wallet.
