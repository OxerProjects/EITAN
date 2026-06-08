# EITAN 2.0 — מערכת התראות חירום

מערכת "חדר מצב" סטטית (HTML/CSS/JS, ללא שלב build) להצגת התראות צבע אדום בזמן אמת
על מפת Leaflet, עם שכבות מפה, ערוצי שידור חיים, טיימר שהייה והתראה אישית.
רצה כ-Static Site (למשל GitHub Pages) — אין שרת, אין מפתחות API.

## הרצה מקומית

מכיוון שהאתר סטטי, כל שרת קבצים סטטי יספיק:

```sh
# Python
python -m http.server 8000
# או Node
npx serve .
```

ואז לפתוח את `http://localhost:8000`.

> הערה: פתיחת `index.html` ישירות (file://) עלולה להיכשל בחלק מהבקשות. הריצו דרך שרת מקומי.

## ארכיטקטורה

- `index.html` — מבנה הממשק.
- `style.css` — ערכת Command-Center (design tokens, glassmorphism, רספונסיבי).
- `cities.json` — מאגר ערים (שם → קואורדינטות + countdown), נטען מקומית ומתמזג עם המקור המקוון.
- `JavaScript/config.js` — קונפיג מרכזי: endpoints, proxies, סוגי איום, זמני חיים, מקורות.
- `JavaScript/alerts.js` — **AlertEngine**: מקור-אמת יחיד, רינדור אידמפוטנטי (ללא כפילויות),
  WebSocket בזמן אמת (`wss://ws.tzevaadom.co.il`) עם נפילה אוטומטית ל-REST polling דרך CORS proxy.
- `JavaScript/map.js` — שכבות מפה: מזג אוויר (RainViewer, מונפש), מטוסים (adsb.lol),
  רעידות אדמה (USGS), לוויין (Esri), גבולות מדינות אויב, מקלטים (Overpass).
- `JavaScript/media.js` — ממשק: פאנל צד, מצבים, ערוצים, טיימר, הגדרות.

## בדיקה

מתוך ה-console של הדפדפן:

```js
simulateAlert();       // התראה בודדת (משתמש ב-targetCity אם הוגדר)
simulateMultiAlert();  // כמה אזורים + סוגי איום
forceMapMarker();      // סימון כפוי על תל אביב
```

או דרך פאנל ההגדרות (אייקון הגלגל) ← "סימולציה ובדיקה".

## הערות

- מקור ההתראות הוא ה-API הלא-רשמי של צבע אדום (Tzeva Adom). בזמן אמת דרך WebSocket;
  אם הוא חסום (CORS/Origin) המערכת עוברת אוטומטית ל-REST דרך proxy.
- כל המקורות חינמיים וללא מפתח API.

By OMER HACKMON
