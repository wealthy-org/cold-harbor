# UX polish app pages (todo)

Tujuan: app page (`/app/*`, `/mm`) terasa premium seperti landing. Aturan anti-slop tetap berlaku: tanpa glass, gradient, hover bergerak, em dash, Geist/Inter, ikon stok. Font Instrument Sans + JetBrains Mono, amber `signal-500 #FFB020`, ink gelap.

Status: stepper Approve/Execute/Settled di `TradeClient.tsx` sudah diganti dan di-push. Semua poin di bawah belum dikerjakan.

Urutan kerja: putaran 1 = poin 1, 2, 4 di Trade. Putaran 2 = poin 3, 5, 6 ke semua halaman. Putaran 3 = poin 7 per halaman.

## 1. Hierarki angka (dampak terbesar)
- [ ] Harga best quote dan jumlah yang diterima dibuat besar (tampilan 40 sampai 48px, JetBrains Mono, tabular). Label kecil di atasnya. Sekarang semua baris seukuran, jadi mata tidak tahu harus ke mana.
- [ ] Ringkasan quote (pay, receive, fee) dijadikan satu blok "receipt" dengan garis pemisah tipis dan angka rata kanan.

## 2. Quote Room lebih hidup
- [ ] Best quote diberi marker amber di sisi kiri kartunya, bukan kartu yang semuanya sama.
- [ ] Countdown jadi bar tipis yang menyusut di tepi atas kartu, bukan cuma angka.
- [ ] Maker yang belum merespons tampil sebagai baris skeleton. Saat quote masuk, barisnya muncul dengan fade pendek.
- [ ] Baris maker dibuat lebih padat, dengan spread bps rata kanan di kolom sendiri.

## 3. Ritme dan kerapatan
- [ ] Pakai skala spasi tetap (8/16/24/40), karena sekarang jaraknya terasa acak.
- [ ] Panel dipisahkan dengan garis 1px dan perbedaan lapisan ink (`ink-900` di atas `ink-950`), bukan border semua sisi.
- [ ] Lebar konten dibatasi dan header halaman diperkecil, karena ruang kosong di desktop belum dimanfaatkan.

## 4. Header dan navigasi app
- [ ] Chip wallet dengan titik status jaringan (hijau, "Testnet 46630"), saldo USDG, dan menu akun.
- [ ] Tab aktif memakai garis bawah amber, bukan teks saja.
- [ ] Footer status tipis: block terakhir, status relay (live/offline), dan label "testnet". Ini memberi kesan terminal institusional.

## 5. State kosong dan loading
- [ ] "Your Fills" yang kosong dan loading diganti skeleton dan teks yang jelas, bukan area hampa.
- [ ] Tombol disabled diberi alasan di bawahnya ("Connect wallet", "Quote expired").

## 6. Detail kecil yang terasa mahal
- [ ] Angka harga berubah dengan transisi `tabular-nums` dan flash warna 300ms (hijau naik, merah turun), tanpa gerakan.
- [ ] Hash dan alamat bisa disalin dengan satu klik dan ada toast.
- [ ] Shortcut keyboard untuk Request quotes dan Execute.
- [ ] Fokus ring konsisten berwarna amber.

## 7. Portfolio, Forwards, dan `/mm`
- [ ] Portfolio: kartu ringkasan PnL di atas dengan angka besar, lalu tabel dengan header lengket dan kolom angka rata kanan.
- [ ] Forwards: tampilkan margin sebagai bar rasio (margin vs required) dengan penanda batas likuidasi. Itu jauh lebih informatif daripada angka mentah.
- [ ] `/mm`: tabel limit dengan pemakaian terhadap limit berbentuk bar.

## Catatan
- Reload skill `web-ui-retheme-polish` sebelum mulai (aturan anti-slop lengkap).
- Data simulasi tetap harus berlabel.
- Cek `tsc` dan `eslint` sebelum commit, lalu lihat hasil di browser lewat wallet.
