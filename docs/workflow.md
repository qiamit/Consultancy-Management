# काम करने का तरीका (Cloud + Git + Live database)

Consultancy Pro (QE Consultancy) का सारा काम **Claude के cloud sessions** में होता है। Mac या किसी local
computer पर app, database या test copy नहीं चलती। Database **एक ही** है: Oracle server पर चल रहा live database।

| | `testing` branch | `main` branch |
|---|---|---|
| किसलिए | सारी editing और जाँच | Live app |
| कहाँ खुलता है | **https://preview.qengineering.in** (नीचे लाल "TESTING · live data" और tab में `[TEST]`) | **https://qengineering.in** |
| Database | Live database (वही) | Live database |
| Deploy | `testing` पर हर push के बाद अपने-आप (GitHub → "Deploy preview") | `main` पर हर merge के बाद अपने-आप, **पहले backup** (GitHub → "Deploy to Oracle") |
| Migrations | **कभी नहीं** लगतीं | Release के साथ लगती हैं |

Server: Oracle Cloud, `qe-consultancy` (129.225.118.1), 2 OCPU / 12 GB। Preview site सिर्फ़ static files है;
preview का backend (functions / PDF) तभी अलग चलता है जब `testing` उसे बदलता है (नीचे "Backend बदलाव")।

## रोज़ का काम

1. Owner cloud session में काम बताते हैं। Session अपनी branch पर code बदलता है, `npm run build`
   (`frontend/web`) और typecheck चलाता है (`npx tsc --noEmit -p tsconfig.app.json`, error count पहले जितना)।
2. Session अपना काम **`testing` में merge** करता है (PR → `testing`)। GitHub अपने-आप preview deploy करता है
   (5–10 मिनट)।
3. Owner **https://preview.qengineering.in** पर अपने असली login से जाँचते हैं, सिर्फ़ test client **Quality International** पर (नियम 2)।
4. Owner OK कहें तो session **`testing` → `main`** का PR बनाता है, और owner के OK पर merge करता है।
   Merge होते ही "Deploy to Oracle" चलता है: **database backup** → web build → containers → migrations।
5. Session https://qengineering.in पर बदला हुआ हिस्सा जाँचकर owner को बताता है।

गलत release: owner को बताएँ, `main` पर revert का PR बनाएँ, owner के OK पर merge करें (फिर से backup +
deploy)। Database की गड़बड़ी के लिए release से पहले वाला backup है (नियम 4)।

## नियम

### 1. Migrations (database में बदलाव)

- Preview deploy migrations **कभी नहीं** लगाता। जो migration `testing` में है पर database में नहीं, preview deploy
  उसका नाम सिर्फ़ दिखाता है।
- जिस काम में migration है, उसकी जाँच preview पर पूरी नहीं हो सकती। ऐसे काम में: `testing` का **सारा** काम पूरा
  और जाँचा हुआ हो, फिर पूरा `testing` एक साथ `main` में merge होकर live होता है (migration के साथ), भले एक दिन
  देर हो। तब तक बाकी सामान्य काम चलता रहता है।
- Migration ऐसी लिखें कि पुराना code उसके बाद भी चले: नया column / table जोड़ना ठीक; column हटाना या नाम
  बदलना अलग release में, जब कोई code उसे इस्तेमाल न करे।
- पहले लग चुकी migration file कभी न बदलें (वह दोबारा नहीं चलती)। नई file बनाएँ।

### 2. Test data

- जाँच **सिर्फ़ एक test client** पर: **Quality International** (owner ने 18 Nov 2026 को तय किया)। कोई भी काम
  हो, उसकी जाँच इसी client पर। किसी और client पर कभी नहीं।
- जाँच ख़त्म होते ही उसी समय test के records (sample, SRF, report, application, document …) हटाएँ।
- **Numbering:** Consultancy Pro में Test Report No, NABL ULR No जैसे LIMS वाले नंबर इस्तेमाल नहीं होते।
  - Finance documents (invoice, quotation, payment, credit / debit note, purchase …): नंबर एक counter
    (`document_series`) से मिलता है, जो record हटाने पर **वापस नहीं घटता**, और app में उसे बदलने की screen नहीं
    है। इसलिए testing में ऐसे documents **नंबर देकर save न करें**। ज़रूरी हो तो पहले owner से पूछें।
  - कोई और क्रम वाला नंबर: उस हिस्से की जाँच से पहले session code में देखकर owner को बताए कि नंबर कैसे बनता
    है, और test record हटाने पर अगला असली काम वही नंबर लेगा या नहीं।

### 3. Email और reminders

- Mail भेजने वाला हर काम (renewal reminder "send now", customer portal invite, QE Assistant mail …) सिर्फ़ test
  client Quality International पर। ऐसी जाँच से पहले session owner से पक्का करे कि Quality International के
  email (और contacts के email) owner के अपने हैं।
- Preview के अपने functions container में renewal reminders, QE Assistant के scheduled tasks और mail sync
  **बंद** रहते हैं। वे सिर्फ़ live functions चलाते हैं।

### 4. Backup

- हर release (`main` का हर deploy) सबसे पहले database का backup लेता है:
  `/opt/qe/backups/db/release-<तारीख-समय>.dump` (नए 15 रखे जाते हैं)। Backup fail हो तो release रुक जाता है।
- रात का backup (02:30 IST, 14 दिन, server के बाहर encrypted copy) पहले की तरह चलता है
  (`deploy/oracle/README.md` → Backups)।

### 5. Backend बदलाव (functions, PDF service)

- `testing` में `backend/services/functions` या `backend/services/pdf-service` बदला हो, तो preview deploy उनके
  अलग containers (`preview-functions`, `preview-pdf`) चलाता है। Preview site की functions / PDF calls उन्हीं पर
  जाती हैं; live site पहले की तरह live containers पर।
- `testing` उन्हें न बदले तो preview containers बंद रहते हैं और preview site live वाले इस्तेमाल करता है।
- Preview containers भी live database पर काम करते हैं, इसलिए नियम 2 और 3 उन पर भी लागू हैं।
- MCP server और database की बाकी services का preview नहीं है: उनके बदलाव release के बाद live पर जाँचे जाते हैं।

### 6. Security

- Preview पर login असली accounts से होता है, Two-Step Login के साथ।
- Database password, service key या कोई secret cloud session में नहीं रखा जाता, chat में नहीं माँगा या छापा
  जाता। Passwords (Manak, BSB, Zoho) owner खुद app में डालते हैं।
- Session कभी सीधे live database पर SQL नहीं चलाता। Database में बदलाव सिर्फ़ migration से, release के साथ।

### 7. Sessions के लिए

- Owner को जवाब हिंदी में: क्या हो रहा है और owner को क्या करना है।
- `main` में merge सिर्फ़ owner के OK पर। `testing` में merge build और typecheck पास होने पर।
- कोई अलग test copy, local database या दूसरा server नहीं बनाना।

## एक बार का setup (owner)

1. Domain registrar पर DNS: `preview.qengineering.in` → A record → `129.225.118.1`।
2. यह setup वाला PR `main` में merge होने पर पहला release अपने-आप चलता है (नई deploy script server पर
   पहुँचती है)। उसके **बाद** session `main` से `testing` branch बनाता है, और पहला preview deploy होता है।
   (Server की GitHub key अगर सिर्फ़ `deploy.sh` चला सकती है, तो preview उसी नई `deploy.sh` से होकर जाता है।
   इसलिए `testing` branch नई script के live होने से पहले नहीं बनती।)

## Standards Library (अभी जैसा है वैसा)

- Standards की PDF files owner के Mac पर हैं, और sync अभी Mac से ही चलता है (`deploy/standards-library/README.md`):
  `~/Library/CloudStorage/OneDrive-Personal/Documents/All Standards Databse/Oracle Database`
  (`standards-sync.sh` में `STANDARDS_SRC` का default)। यह folder path न बदलें।
- आगे का plan (अभी नहीं): Standards Library को vector database में बदलना। तब भी sync इसी folder से होगा।

## Server config की जाँच

`deploy/oracle/` या workflows बदलने वाले हर PR पर GitHub "Check server config" चलाता है: Caddyfile
(`caddy validate`), दोनों compose files और deploy scripts। लाल हो तो merge न करें।

## Files

| File | काम |
|---|---|
| `.github/workflows/deploy-oracle.yml` | `main` → live (backup, build, containers, migrations) |
| `.github/workflows/deploy-preview.yml` | `testing` → preview |
| `deploy/oracle/scripts/deploy.sh` | Server पर live release |
| `deploy/oracle/scripts/preview-deploy.sh` | Server पर preview: `/opt/qe/preview` में `testing`, web build, preview backend |
| `deploy/oracle/preview/docker-compose.yml` | `preview-functions`, `preview-pdf` (scheduled jobs बंद) |
| `deploy/oracle/Caddyfile` | `preview.qengineering.in` site, preview origin के लिए CORS और routing |
| `.github/workflows/check-server-config.yml` | PR पर Caddyfile, compose files और scripts की जाँच |
| `deploy/oracle/release-plan.sh` | Release से पहले: कौन-सी migrations और कौन-से हिस्से बदलेंगे (सिर्फ़ पढ़ता है) |
