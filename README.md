# Oylik Hisob

Xodimlar davomati, avans va oylik hisob-kitobi uchun mobil veb-ilova (Firebase Firestore).

## Imkoniyatlar
- Xodimlar (kunlik / oylik maosh), umumiy statistika
- Keldi-ketdi: to'liq / yarim / kelmadi, "hammasini keldi qilish", kunlarni ‹ › bilan almashtirish
- Avans, pul qaytarish, oylik yopish (avans oshib ketsa qarz keyingi davrga o'tadi)
- Tarix: filtr, jami summalar, Excel (CSV) ga yuklab olish
- Xodim kalendari: yopilgan davrlar, oylik statistika
- Offline rejim (internet qaytganda avtomatik sinxronlanadi)

## ⚠️ Xavfsizlik (muhim)
Hozir bazaga **login talab qilinmaydi** — `script.js` dagi Firebase kalitini bilgan
har kim ma'lumotlarni o'qishi va o'chirishi mumkin. `1234` paroli faqat tasodifiy
o'chirishdan himoya qiladi, chunki u brauzer kodida ochiq turadi.

Tavsiya: Firebase Console → Authentication'da Email/Google login yoqing va
Firestore Rules'ni quyidagicha o'rnating:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /appData/{doc} {
      allow read, write: if request.auth != null
        && request.auth.token.email in ['sizning@email.com'];
    }
  }
}
```
