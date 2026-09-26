# TopTown v020

## OpenAI sohbet botu

### Bot koltuğu ve yönetici sponsorlu hediyeler

AI botlar panelinde odaya katılmış bot için 1–9 koltuk veya Ayakta seçilebilir. İnsanlarla koltuk çakışması ve kilitli koltuğa oturma engellenir. Bot odadan çıkınca koltuğu boşalır; koltuk durumu yeniden başlatmada sıfırlanır. Bot kamera veya mikrofon kullanmaz.

Admin seçili odadaki alıcıya bot adına hediye gönderebilir. Bedel işlemi yapan adminin mevcut jetonlarından düşer, alıcıya eklenir. Hediye geçmişinde sponsor admin kayıtlıdır; animasyon ve bildirimde bot adı görünür. Otomatik gönderim ve ayrı bot cüzdanı yoktur. Bot hediye alıcısı değildir.

Admin AI botlar ekranındaki **Bot odada bulunsun** seçimi giriş/çıkış kaydı üretir ve botu katılımcı listesine ekler. **Kendiliğinden sohbet başlatsın** açıkken yalnızca insan bulunan odalarda, en sık beş dakikada bir ücretsiz hazır açılış mesajı paylaşılır. Aktif sohbetin son mesajı bir dakikadan yeniyse atlanır. Bu açılışlar OpenAI çağrısı değildir; oda geçmişi dışarı gönderilmez. Botlar insan sayacına dahil edilmez, medya almaz ve hediye alıcısı olarak listelenmez. Ayarlar PostgreSQL'de kalıcıdır.

Railway sunucusunda `OPENAI_API_KEY` ayarlayın. Anahtarı koda, tarayıcıya veya GitHub'a koymayın. İsteğe bağlı `OPENAI_MODEL` varsayılanı `gpt-4.1-mini` modelidir. Yönetici panelindeki **AI botlar** düğmesinden oda ve bot adı seçerek etkinleştirin. Oda içindeki **AI bota sor** formu açık onayla yalnızca yazılan soruyu OpenAI Responses API'ye gönderir (`store:false`); oda geçmişi, özel mesajlar ve hesap bilgileri gönderilmez. Yanıt odada `[BOT]` etiketiyle görünür ve mesaj geçmişine kaydedilir.

Bot varsayılan olarak kapalıdır. Kullanıcı başına 30 saniye bekleme, oda başına bir eşzamanlı çağrı, toplam üç eşzamanlı çağrı ve UTC gününe göre site genelinde 100 istek sınırı vardır. Hatalı çağrı girişimleri de günlük sınıra dahildir. PostgreSQL günlük sayacı yeniden başlatmada korunur. Bu bir para limiti değildir; OpenAI proje bütçesini ayrıca ayarlayın. API ücretlidir. Odayı dinleme ve hediye/jeton işlemleri bu entegrasyona dahil değildir. Bot araç erişimine sahip değildir.

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
