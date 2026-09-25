# TopTown v19

Node.js + Express + PostgreSQL sosyal oda uygulaması. Dokuz koltuk, WebRTC ses/video, hediye, oda yönetimi, profil, arkadaşlar, özel mesaj, bildirim ve yönetici ekranları içerir.

## Çalıştırma

Node.js 22 veya üstü gerekir. `npm ci`, ardından `npm start` çalıştırın. Varsayılan port 3000.

- `DATABASE_URL`: PostgreSQL bağlantısı. Üretimde gereklidir. Yoksa yalnızca geçici geliştirme verisi kullanılır.
- `PORT`: HTTP portu; Railway sağlar.
- `ADMIN_PASSWORD`: Yeni kurulumun ilk yönetici parolası. Mevcut yönetici parolasını değiştirmez. Ayarlanmamışsa yeni yöneticinin parolası rastgele olur.

Eski SHA256 hesapları ilk başarılı girişte scrypt'e yükseltilir. Oturumlar PostgreSQL'de yedi gün saklanır, çıkışta iptal edilir. Şema değişiklikleri `src/migrations` dizinindedir; başlangıçta transaction ve migration kaydıyla uygulanır. Eski `schema.sql` ve `worker.js` Cloudflare dönemine aittir; Node.js dağıtımında çalıştırmayın.

## Yapı

- `server.js`: başlangıç, ortak servisler ve uygulama durumu.
- `src/routes`: kimlik, oda, sohbet, ekonomi, sosyal ve yönetim API modülleri.
- `src/security.js`: scrypt ve giriş deneme limiti.
- `src/database.js`: PostgreSQL migration yürütücüsü.
- `public/design.css`: ortak tasarım sistemi, mobil ve açık/koyu tema.
- `public/app.js`: sohbet istemcisi ve medya yönetimi.
- `tests`: parola ve tarayıcı/API regresyon testleri.

## Doğrulama

`npm test`

`npx playwright install chromium` ve `npx playwright test`

Tarayıcı testleri ayrı, geçici bir sunucuda çalışır; üretim veritabanını kullanmaz.

## Üretim sınırları

Tek Node.js instance kullanın: oda presence ve medya sinyalleri süreç belleğindedir. Presence 60 saniye haber alınmazsa kaldırılır. STUN kullanılır; farklı ağlarda medya bağlantısı garanti edilmez. Şema ve hediye SQL'i gömülü PostgreSQL (PGlite) üzerinde test edilir; migration kilidi bu testte simüle edilir. Railway veritabanının yedeği ve iki fiziksel cihazda medya testi ayrıca gereklidir. Yeni servis çalışanı güncel dosyaları ağdan getirir; özel API verisini önbelleğe almaz.
