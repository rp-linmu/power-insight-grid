# 浠ｇ爜鍔熻兘浠嬬粛

鏈枃妗ｄ粠浠ｇ爜缁撴瀯瑙掑害璇存槑 Power Insight Grid 寮€婧愭暣鐞嗙増鐨勫姛鑳芥ā鍧椼€佷富瑕佹枃浠跺拰鏁版嵁娴併€?
## 1. 鎬讳綋鏋舵瀯

椤圭洰鐢变笁涓富瑕侀儴鍒嗙粍鎴愶細

```text
Power Insight Grid
鈹溾攢 frontend              # Next.js 鍓嶇椤甸潰
鈹溾攢 backend               # FastAPI 鍚庣鏈嶅姟
鈹溾攢 gd-market-crawler     # 鏁版嵁鑾峰彇鎺у埗鏈嶅姟
鈹溾攢 deploy                # 閮ㄧ讲绀轰緥
鈹斺攢 docs                  # 椤圭洰璇存槑鏂囨。
```

鏁翠綋鏁版嵁娴侊細

```text
Excel / 婕旂ず鏁版嵁 / 鐖櫕涓嬭浇鏂囦欢
        鈫?backend 瀵煎叆涓庤В鏋?        鈫?SQLite 鏈湴鏁版嵁搴?        鈫?FastAPI 鎺ュ彛
        鈫?Next.js 鍓嶇椤甸潰
```

## 2. 鍓嶇鍔熻兘

鍓嶇鐩綍锛?
```text
frontend
```

涓昏鎶€鏈細

- Next.js
- React
- TypeScript
- 鍘熺敓 CSS

### 2.1 椤甸潰鍏ュ彛

涓昏椤甸潰浣嶄簬锛?
```text
frontend/app
```

鏍稿績椤甸潰锛?
| 椤甸潰璺緞 | 鏂囦欢 | 鍔熻兘 |
| --- | --- | --- |
| `/` | `frontend/app/page.tsx` | 棣栭〉涓庣洏鍓嶇爺鍒ゆ瑙?|
| `/spot` | `frontend/app/spot/page.tsx` | 鐜拌揣妯″潡鍏ュ彛 |
| `/disclosure` | `frontend/app/disclosure/page.tsx` | 鍩烘湰闈㈡暟鎹睍绀?|
| `/clearing` | `frontend/app/clearing/page.tsx` | 甯傚満鍑烘竻涓庡垎鏃剁數閲忓睍绀?|
| `/operations` | `frontend/app/operations/page.tsx` | 杩愯涓庢淇€佹満缁勭姸鎬佹煡鐪?|
| `/topology` | `frontend/app/topology/page.tsx` | 缃戞灦鎷撴墤闃诲璇嗗埆 |
| `/data-acquisition` | `frontend/app/data-acquisition/page.tsx` | 鏁版嵁鑾峰彇鎺у埗椤甸潰 |
| `/imports` | `frontend/app/imports/page.tsx` | 瀵煎叆绠＄悊 |
| `/policies` | `frontend/app/policies/page.tsx` | 鏀跨瓥鏂囦欢绠＄悊涓庤В璇?|
| `/midterm` | `frontend/app/midterm/page.tsx` | 涓暱鏈熸ā鍧楀崰浣嶉〉 |

### 2.2 閫氱敤缁勪欢

涓昏缁勪欢浣嶄簬锛?
```text
frontend/components
```

| 缁勪欢 | 鍔熻兘 |
| --- | --- |
| `TradingDayBar.tsx` | 鍏ㄥ眬浜ゆ槗鏃ラ€夋嫨鏍?|
| `LineChart.tsx` | 閫氱敤鏇茬嚎鍥剧粍浠?|
| `BoundaryDashboard.tsx` | 鍩烘湰闈㈣竟鐣屾暟鎹仈鍔ㄥ睍绀?|
| `UnitCommitmentLinkage.tsx` | 寮€鍋滄満绾︽潫涓庡嚭鍔涜兘鍔涜仈鍔?|
| `TopologyTimeSlider.tsx` | 鎷撴墤鏃跺埢婊戝潡 |
| `TopologyNetworkViewer.tsx` | 鎷撴墤缃戠粶鍥惧睍绀?|
| `CrawlerWorkspace.tsx` | 鏁版嵁鑾峰彇浠诲姟鎿嶄綔鍖?|
| `RecordTable.tsx` | 閫氱敤璁板綍琛ㄦ牸 |
| `PolicyWorkspacePanel.tsx` | 鏀跨瓥鏂囦欢宸ヤ綔鍖?|
| `PolicyChatBox.tsx` | 鏀跨瓥闂瓟缁勪欢 |

### 2.3 API 璋冪敤灏佽

鍓嶇 API 灏佽浣嶄簬锛?
```text
frontend/lib/api.ts
```

璇ユ枃浠惰礋璐ｏ細

- 缁熶竴鍚庣 API 鍦板潃銆?- 瀹氫箟鍓嶇浣跨敤鐨勬暟鎹被鍨嬨€?- 鎻愪緵鍚勯〉闈㈢殑鏁版嵁璇锋眰鍑芥暟銆?
榛樿鍚庣鍦板潃锛?
```text
http://127.0.0.1:8001
```

## 3. 鍚庣鍔熻兘

鍚庣鐩綍锛?
```text
backend
```

涓昏鎶€鏈細

- FastAPI
- SQLite
- Python 鏍囧噯搴?- pypdf

### 3.1 搴旂敤鍏ュ彛

```text
backend/app/main.py
```

璐熻矗鍒涘缓 FastAPI 搴旂敤骞舵寕杞藉悇涓氬姟璺敱銆?
鐢熷懡鍛ㄦ湡鍒濆鍖栵細

```text
backend/app/lifecycle.py
```

涓昏璐熻矗鏁版嵁搴撳垵濮嬪寲銆侀粯璁ゅ鍏ョ洰鏍囧垵濮嬪寲绛夈€?
### 3.2 閰嶇疆绠＄悊

```text
backend/app/core/config.py
```

璐熻矗璇诲彇锛?
- 鏁版嵁搴撹矾寰?- 鏁版嵁鐩綍
- 鏀跨瓥 AI 鐩稿叧鐜鍙橀噺
- 杩愯鏃惰矾寰?
澶фā鍨嬬浉鍏冲彉閲忥細

```text
POLICY_LLM_API_KEY
POLICY_LLM_BASE_URL
POLICY_LLM_MODEL
POLICY_LLM_TIMEOUT
```

### 3.3 鏁版嵁搴撶粨鏋?
```text
backend/app/db.py
```

璐熻矗锛?
- SQLite 杩炴帴绠＄悊銆?- 寤鸿〃璇彞銆?- 绱㈠紩鍒濆鍖栥€?- 瀵煎叆鏁版嵁閲嶇疆銆?
鏍稿績鏁版嵁琛ㄧ被鍨嬪寘鎷細

- 瀵煎叆鎵规
- 鏃跺簭鏁版嵁
- 琛ㄦ牸璁板綍
- 鏂囨湰璁板綍
- 鏀跨瓥鏂囦欢
- 瀵煎叆鐗堟湰
- 缃戞灦鑺傜偣涓庣嚎璺?- 鎷撴墤鍒嗘瀽缁撴灉
- 鏈湴鐢ㄦ埛涓庝細璇濊〃

### 3.4 API 璺敱

鍚庣璺敱浣嶄簬锛?
```text
backend/app/routers
```

| 璺敱鏂囦欢 | 鍔熻兘 |
| --- | --- |
| `system.py` | 绯荤粺姒傝涓庡熀纭€鐘舵€?|
| `trading.py` | 浜ゆ槗鏃ヤ笂涓嬫枃銆佺洏鍓嶇爺鍒?|
| `disclosure.py` | 鍩烘湰闈€佸嚭娓呫€佽〃鏍艰褰曟煡璇?|
| `topology.py` | 缃戞灦鎷撴墤鐘舵€佷笌鍒嗘瀽缁撴灉 |
| `imports.py` | 鏁版嵁瀵煎叆銆佺増鏈鐞嗐€佸叆搴撶姸鎬?|
| `crawler.py` | 鏁版嵁鑾峰彇鏈嶅姟鐘舵€佷笌鍚屾 |
| `policies.py` | 鏀跨瓥鏂囦欢銆佹斂绛栬В璇汇€佹斂绛栭棶绛?|

### 3.5 鏁版嵁瑙ｆ瀽涓庡鍏?
鏍稿績鏂囦欢锛?
```text
backend/app/services/importer.py
backend/app/services/xlsx_reader.py
backend/app/services/date_rules.py
backend/app/services/imports_service.py
```

涓昏鑳藉姏锛?
- 璇诲彇 Excel 宸ヤ綔绨裤€?- 璇嗗埆鏁版嵁鏃ユ湡銆?- 璇嗗埆鏃ュ墠銆佸疄鏃躲€侀娴嬨€佸疄闄呯瓑甯傚満鍙ｅ緞銆?- 灏嗘椂搴忔暟鎹啓鍏ユ暟鎹簱銆?- 灏嗘櫘閫氳〃鏍艰褰曞啓鍏ユ暟鎹簱銆?- 缁存姢瀵煎叆鐗堟湰鍜屾枃浠剁姸鎬併€?
瀵煎叆鐩爣閰嶇疆锛?
```text
backend/app/core/import_targets.py
```

鐢ㄤ簬瀹氫箟瀵煎叆绠＄悊椤甸潰涓睍绀虹殑鍏紑妯″潡鏁版嵁椤广€?
### 3.6 浜ゆ槗鏃ヤ笌鐩樺墠鐮斿垽

鏍稿績鏂囦欢锛?
```text
backend/app/services/trading_service.py
backend/app/repositories/trading.py
```

涓昏鑳藉姏锛?
- 璇嗗埆褰撳墠浜ゆ槗鏃ユ暟鎹畬鏁村害銆?- 姹囨€诲叧閿熀鏈潰鎸囨爣銆?- 鐢熸垚棣栭〉鍜岀洏鍓嶇爺鍒ら渶瑕佺殑鎸囨爣銆侀闄╅」鍜屽叧閿椂鍒汇€?
### 3.7 鍩烘湰闈㈠拰鍑烘竻鏁版嵁

鏍稿績鏂囦欢锛?
```text
backend/app/services/disclosure_service.py
backend/app/repositories/disclosure.py
```

涓昏鑳藉姏锛?
- 鏌ヨ鏃跺簭鏇茬嚎銆?- 鏌ヨ琛ㄦ牸璁板綍銆?- 鏌ヨ鍙敤鏃ユ湡銆?- 姹囨€绘棩鍓嶃€佸疄鏃跺競鍦哄嚭娓呭拰鍒嗘椂鍒嗙被鐢甸噺鏁版嵁銆?- 鏀寔鍓嶇鍩烘湰闈€佸競鍦哄嚭娓呭拰杩愯妫€淇〉闈㈠睍绀恒€?
### 3.8 缃戞灦鎷撴墤闃诲璇嗗埆

鏍稿績鏂囦欢锛?
```text
backend/app/services/topology_service.py
backend/app/repositories/topology.py
```

涓昏鑳藉姏锛?
- 璇诲彇缃戞灦绾胯矾鍜岃妭鐐规暟鎹€?- 鍩轰簬鑺傜偣鐢典环璁＄畻绾胯矾涓ょ浠峰樊銆?- 鐢熸垚闃诲绾胯矾鎺掑簭銆?- 鏀寔鎸夋椂鍒绘煡鐪嬫嫇鎵戦樆濉炴儏鍐点€?- 杩斿洖鍓嶇鎷撴墤鍥惧睍绀烘墍闇€鑺傜偣銆佽竟鍜岄樆濉炵姸鎬併€?
璇存槑锛?
- 褰撳墠寮€婧愭暣鐞嗙増淇濈暀閫氱敤鎷撴墤鍒嗘瀽浠ｇ爜銆?- 瀹為檯宸ョ▼涓渶瑕佹牴鎹嚜宸辩殑绾胯矾琛ㄣ€佽妭鐐硅〃鍜岃妭鐐圭數浠锋暟鎹畬鎴愭槧灏勬牎鍑嗐€?
### 3.9 鏀跨瓥鏂囦欢绠＄悊涓庤В璇?
鏍稿績鏂囦欢锛?
```text
backend/app/services/policy_parser.py
backend/app/services/policy_ai.py
backend/app/services/policy_service.py
backend/app/services/policy_profiles.py
backend/app/policy_profiles
```

涓昏鑳藉姏锛?
- 瑙ｆ瀽鏀跨瓥 PDF 鎴栨枃鏈厓淇℃伅銆?- 浣跨敤瑙勫垯妯℃澘鎻愬彇鏀跨瓥鍏抽敭鐐广€?- 鍙€夋帴鍏ュぇ妯″瀷杩涜缁撴瀯鍖栬В璇汇€?- 鏀寔鏀跨瓥闂瓟銆侀噸鍒嗘瀽銆佺増鏈鐞嗐€?
鏈厤缃?`POLICY_LLM_API_KEY` 鏃讹紝AI 瑙ｈ鑳藉姏涓嶄細鍚敤銆?
### 3.10 鏁版嵁鑾峰彇鏈嶅姟妗ユ帴

鏍稿績鏂囦欢锛?
```text
backend/app/services/crawler_control_service.py
backend/app/services/crawler_bridge.py
backend/app/routers/crawler.py
```

涓昏鑳藉姏锛?
- 妫€鏌ユ湰鍦版暟鎹幏鍙栨湇鍔℃槸鍚﹀湪绾裤€?- 瑙﹀彂鐖彇缁撴灉鍚屾銆?- 灏嗘湁鏁堟枃浠跺鍏ユ暟鎹簱銆?- 涓哄墠绔暟鎹幏鍙栭〉闈㈡彁渚涚姸鎬併€?
## 4. 鏁版嵁鑾峰彇宸ュ叿

鐩綍锛?
```text
gd-market-crawler
```

涓昏鎶€鏈細

- Node.js
- 鍘熺敓 HTTP 鏈嶅姟
- 娴忚鍣ㄧ偣鍑讳笅杞借緟鍔╅€昏緫

鏍稿績鏂囦欢锛?
| 鏂囦欢 | 鍔熻兘 |
| --- | --- |
| `src/index.js` | 鍛戒护琛屽叆鍙?|
| `src/config.js` | 閰嶇疆鍔犺浇 |
| `src/tasks/catalog.js` | 浠诲姟娓呭崟 |
| `src/tasks/task-runner.js` | 浠诲姟鎵ц |
| `src/browser/click-task-catalog.js` | 娴忚鍣ㄧ偣鍑讳换鍔″畾涔?|
| `src/browser/click-runner.js` | 鐐瑰嚮浠诲姟杩愯 |
| `src/browser/date-picker.js` | 鏃ユ湡閫夋嫨鍣ㄩ€傞厤 |
| `src/browser/download-validator.js` | 涓嬭浇鏂囦欢鏍￠獙 |
| `src/storage/data-inventory.js` | 鏈湴鏂囦欢搴撳瓨妫€鏌?|
| `src/web/server.js` | Web 鎺у埗鏈嶅姟 |

閰嶇疆鏂囦欢锛?
```text
gd-market-crawler/config.example.json
```

鏈湴瀹為檯杩愯鏃跺簲澶嶅埗涓猴細

```text
gd-market-crawler/config.local.json
```

`config.local.json` 涓嶅簲鎻愪氦鍒?GitHub銆?
## 5. 閮ㄧ讲绀轰緥

閮ㄧ讲鏂囦欢浣嶄簬锛?
```text
deploy
```

鍖呭惈锛?
- `docker-compose.prod.yml`
- Nginx 閰嶇疆绀轰緥
- 鍙嶅悜浠ｇ悊閰嶇疆鐗囨

杩欎簺鏂囦欢鐢ㄤ簬鐢熶骇閮ㄧ讲鍙傝€冿紝瀹為檯閮ㄧ讲鏃堕渶瑕佹牴鎹嚜宸辩殑鍩熷悕銆佺鍙ｃ€佽瘉涔﹀拰鐜鍙橀噺璋冩暣銆?
## 6. 寮€婧愮増鍔熻兘杈圭晫

鏈紑婧愭暣鐞嗙増淇濈暀鐨勬槸閫氱敤绯荤粺鑳藉姏锛?
- 鏁版嵁瀵煎叆
- 鏁版嵁灞曠ず
- 甯傚満鍑烘竻鏌ョ湅
- 鍩烘湰闈㈣仈鍔?- 缃戞灦鎷撴墤璇嗗埆妗嗘灦
- 鏀跨瓥鏂囦欢绠＄悊
- 鏁版嵁鑾峰彇鎺у埗妗嗘灦

涓嶅寘鍚鏈夌畻娉曡兘鍔涳細

- 鐭湡浠峰樊棰勬祴妯″瀷
- 浠峰樊鏂瑰悜澶嶇洏妯″瀷
- 涓暱鏈熺數浠烽娴嬫ā鍨?- 鍚堢害鏇茬嚎浼樺寲绠楁硶
- 鐪熷疄鐢熶骇鏁版嵁涓庢ā鍨嬫潈閲?
濡傛灉闇€瑕佹帴鍏ヨ嚜宸辩殑绠楁硶锛屽缓璁柊澧炵嫭绔嬬洰褰曪紝渚嬪锛?
```text
backend/algorithms
```

骞堕€氳繃鏂扮殑 service銆乺outer 鍜?frontend page 鎺ュ叆锛岄伩鍏嶆妸绠楁硶閫昏緫鐩存帴鍐欏叆椤甸潰缁勪欢銆?
## 7. 鎺ㄨ崘寮€鍙戞祦绋?
1. 鍚庣鏂板鏁版嵁鑳藉姏  
   鍦?`backend/app/repositories` 涓皝瑁呮暟鎹簱鏌ヨ銆?
2. 鍚庣鏂板涓氬姟閫昏緫  
   鍦?`backend/app/services` 涓鐞嗕笟鍔¤绠椼€?
3. 鍚庣鏂板鎺ュ彛  
   鍦?`backend/app/routers` 涓毚闇?API銆?
4. 鍓嶇鏂板椤甸潰鎴栫粍浠? 
   鍦?`frontend/app` 鍜?`frontend/components` 涓疄鐜般€?
5. 鍓嶇 API 灏佽  
   鍦?`frontend/lib/api.ts` 涓柊澧炵被鍨嬪拰璇锋眰鍑芥暟銆?
6. 鏁版嵁搴撶粨鏋勮皟鏁? 
   鍦?`backend/app/db.py` 涓淮鎶よ〃缁撴瀯鍜岀储寮曘€?
## 8. 瀹夊叏杈圭晫

浠ヤ笅鏂囦欢鍜岀洰褰曚笉搴旀彁浜わ細

```text
.env
*.db
*.sqlite
data_samples/
uploads/
outputs/
gd-market-crawler/config.local.json
gd-market-crawler/downloads/
gd-market-crawler/browser-data/
frontend/node_modules/
frontend/.next/
*.log
*.pkl
*.joblib
```

涓婁紶 GitHub 鍓嶈鎵ц锛?
```powershell
rg --files | rg "(\.env$|config\.local\.json$|\.db$|\.sqlite$|\.xlsx$|\.csv$|\.log$|\.pkl$|node_modules|\.next|data_samples|downloads)"
rg -n "<local-user-path>|<private-directory>|sk-[A-Za-z0-9_-]{20,}|Bearer\\s+[A-Za-z0-9._-]{20,}" .
```
