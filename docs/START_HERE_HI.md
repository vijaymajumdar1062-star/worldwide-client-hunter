# पहले ये steps करें

Code तैयार है। Google account में authorization, Maps billing/key और web-app deployment अभी आपको करना है। इनके बिना live discovery/email शुरू नहीं हुए हैं।

## 1. Private Google Sheet बनाइए
https://sheets.google.com पर blank Sheet बनाकर नाम रखें `Worldwide Client Hunter`। Sheet या Apps Script किसी को share न करें।

## 2. चार files लगाइए
Sheet → Extensions → Apps Script:
- Code.gs में repository की `apps-script/Code.gs` का पूरा code paste करें।
- बाएँ + → Script → `Maps` बनाकर `apps-script/Maps.gs` paste करें।
- इसी तरह `Demo` बनाकर `apps-script/Demo.gs` paste करें।
- Project Settings → Show appsscript.json manifest file चालू करें। Manifest में `apps-script/appsscript.json` paste करें। Save करें।

Files: https://github.com/vijaymajumdar1062-star/worldwide-client-hunter/tree/main/apps-script

## 3. setup चलाकर Google permissions approve करें
Function dropdown → `setup` → Run। वही Gmail चुनें जिससे emails भेजना है। Gmail read/draft/send, Sheets, external website requests, trigger management और account email permissions चाहिए। Gmail scope broad है; code mail delete नहीं करता। केवल अपने बनाए project को authorize करें।

इससे Leads, Suppression, Ledger, Queries tabs और हर 30 मिनट का `tick_` trigger बनता है। पुरानी lead rows preserve होती हैं। Maps अभी बंद रहेगा।

## 4. Live demo के लिए Web app deploy करें
Apps Script → Deploy → New deployment → gear → Web app:
- Execute as: **Me**
- Who has access: **Anyone** (यदि आपके Google account की policy अनुमति देती है)
- Deploy → `/exec` पर खत्म होने वाला URL copy करें।

Project Settings → Script Properties → Add script property:
`DEMO_BASE_URL` = आपका copied `/exec` URL

URL के अंत में `?sample=salon` लगाकर incognito में खोलें। Sample Salon खुलना चाहिए। Restaurant के लिए `?sample=restaurant`। Google login माँगे तो demo अभी ग्राहक के लिए public नहीं है। Anonymous deployment account policy से blocked हो तो automation रोकें; login wall को bypass न करें।

## 5. Google Maps API key बनाइए
https://console.cloud.google.com/ में:
1. Project चुनें/बनाएँ और billing link करें।
2. APIs & Services → Library → **Places API (New)** → Enable।
3. Credentials → Create credentials → API key।
4. Key की API restrictions में सिर्फ **Places API (New)** allow करें। Apps Script server requests के लिए browser-referrer restriction न लगाएँ।
5. Usage/quotas और billing alerts configure करें। Billing alert खर्च रोकने वाला hard cap नहीं है। यह free-unlimited service नहीं है; website field वाले searches पर applicable Places SKU charges हो सकते हैं।

Apps Script → Project Settings → Script Properties में:
- `MAPS_API_KEY` = आपकी key
- `DEMO_BASE_URL` = step 4 वाला URL
- `SENDER_NAME` = आपका नाम / business name
- `SEARCH_DAILY_CAP` = `4` (शुरुआत में चार search requests/day)
- `DAILY_CAP` = `20` (अधिकतम पहले emails/day; कम कर सकते हैं)

Key GitHub, Sheet cell या chat में paste न करें।

## 6. पहले sending pause रखकर जाँचें
Sheet reload करें → Client Hunter → **Pause sending**। फिर **Enable Maps discovery** → **Sync and prepare drafts**।

Leads tab देखें:
- `business_name`, `category`, `city`: मिला हुआ business।
- `audit_reason`: website न listed होने या mobile viewport/404 जैसी सीमित तकनीकी जाँच का संकेत। Website पुरानी/खराब है यह पक्का दावा नहीं।
- `email_source`: official website के किस public page पर email मिला।
- `demo_url`: उसी नाम/category वाला live proposed design।
- `needs_contact_email`: email नहीं मिला; यह lead email नहीं होगा।

पहले owner-controlled test contact पर end-to-end जाँच करें। Google account में अनुमति होने के बाद ही live Gmail tests संभव हैं।

## 7. Automatic पहला email चालू करें
Demo link incognito में खुलता हो, recipient evidence और draft सही हों, तब Client Hunter → **Enable automatic outreach**। अगला tick qualified/source-verified contacts को पहला personalized email + demo link भेजेगा। Individual approval जरूरी नहीं।

India ₹999 / international $19 starting price, एक-page website। Domain/paid hosting/ecommerce/custom integrations अलग। **कोई automatic follow-up या reply नहीं जाएगा।** Replies आप Gmail में दें। STOP/opt-out पर future contact बंद।

## साफ सीमाएँ
Maps email addresses नहीं देता। Official business website न होने या वहाँ email न मिलने पर पूरी तरह automatic email outreach संभव नहीं है। ऐसे leads `needs_contact_email` में रहेंगे; public contact evidence मिलने पर email/source भर सकते हैं। कोई guessed email, automatic WhatsApp/Instagram message या contact-form submission नहीं है।

72 city/category queries 10+ देशों में seeded हैं; Queries tab से cities/categories बदल सकते हैं। शुरुआती 4 requests/day × अधिकतम 10 results/request = अधिकतम 40 raw listings/day, न कि 40 qualified leads/customers। Queries क्रम से rotate होंगी; पूरा world हर run में scan नहीं होता। Customer आज मिलने की guarantee नहीं है।

बाद में code update करें तो Deploy → Manage deployments → Edit → New version → Deploy करें। केवल editor save करने से पुराना deployed demo code update नहीं होता।
