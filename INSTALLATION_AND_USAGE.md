# 瀹夎涓庝娇鐢ㄦ寚鍗?
鏈枃妗ｈ鏄庡浣曞湪鏈湴瀹夎銆佸惎鍔ㄥ拰妫€鏌?Power Insight Grid 寮€婧愭暣鐞嗙増銆?
## 1. 椤圭洰璇存槑

Power Insight Grid 鏄竴涓潰鍚戠數鍔涘競鍦烘暟鎹睍绀恒€佷俊鎭姭闇插垎鏋愩€佸競鍦哄嚭娓呮煡鐪嬨€佺綉鏋舵嫇鎵戦樆濉炶瘑鍒€佹斂绛栨枃浠剁鐞嗗拰鏁版嵁瀵煎叆绠＄悊鐨勬湰鍦拌緟鍔╁喅绛栫郴缁熴€?
鏈紑婧愭暣鐞嗙増涓嶅寘鍚細

- 鐪熷疄甯傚満鏁版嵁銆佹暟鎹簱銆佹棩蹇椼€佹祻瑙堝櫒浼氳瘽鍜屾湰鍦拌处鍙烽厤缃€?- 绉佹湁鐭湡浠峰樊棰勬祴绠楁硶銆?- 绉佹湁涓暱鏈熶环鏍奸娴嬨€佸悎绾︽洸绾夸紭鍖栧拰璋冩暣绠楁硶銆?- 浠讳綍鐪熷疄 API Key銆丆ookie銆乁Key 浼氳瘽淇℃伅銆?
## 2. 鐜瑕佹眰

寤鸿鐜锛?
- Windows 10/11
- Python 3.10 鎴栨洿楂樼増鏈?- Node.js 20 鎴栨洿楂樼増鏈?- npm

椤圭洰鍖呭惈涓変釜涓昏杩愯閮ㄥ垎锛?
- 鍚庣 API锛歚backend`
- 鍓嶇椤甸潰锛歚frontend`
- 鏁版嵁鑾峰彇鎺у埗鏈嶅姟锛歚gd-market-crawler`

## 3. 鑾峰彇浠ｇ爜

浠?GitHub 鍏嬮殕浠ｇ爜鍚庤繘鍏ラ」鐩洰褰曪細

```powershell
git clone <your-repository-url>
cd <your-repository-folder>
```

濡傛灉浣犳槸鍦ㄦ湰鍦版暣鐞嗙洰褰曚腑娴嬭瘯锛?
```powershell
cd open_source_release
```

## 4. 閰嶇疆鐜鍙橀噺

澶嶅埗绀轰緥閰嶇疆锛?
```powershell
Copy-Item .env.example .env
```

榛樿鎯呭喌涓嬬郴缁熷彲浠ヤ笉閰嶇疆澶фā鍨?API Key 鍚姩銆傝嫢闇€瑕佸惎鐢ㄦ斂绛栨枃浠?AI 瑙ｈ锛屽彲鍦?`.env` 鎴栫郴缁熺幆澧冨彉閲忎腑閰嶇疆锛?
```env
POLICY_LLM_API_KEY=
POLICY_LLM_BASE_URL=https://api.openai.com/v1
POLICY_LLM_MODEL=
POLICY_LLM_TIMEOUT=60
```

娉ㄦ剰锛?
- 涓嶈鎻愪氦鐪熷疄 `.env` 鏂囦欢銆?- 涓嶈鎻愪氦鐪熷疄 API Key銆?- 涓嶈鎻愪氦 `gd-market-crawler/config.local.json`銆?
## 5. 瀹夎鍚庣渚濊禆

杩涘叆鍚庣鐩綍锛?
```powershell
cd backend
python -m pip install -r requirements.txt
```

濡傛灉浣犵殑 Python 涓嶅湪 PATH 涓紝鍙互浣跨敤瀹屾暣璺緞锛?
```powershell
C:\path\to\python.exe -m pip install -r requirements.txt
```

## 6. 瀹夎鍓嶇渚濊禆

杩涘叆鍓嶇鐩綍锛?
```powershell
cd ..\frontend
npm install
```

## 7. 瀵煎叆婕旂ず鏁版嵁

寮€婧愬寘涓嶅寘鍚湡瀹炴暟鎹€備负浜嗘鏌ラ〉闈㈡槸鍚﹁兘姝ｅ父灞曠ず锛屽彲浠ュ鍏ュ唴缃殑鑴辨晱婕旂ず鏁版嵁锛?
```powershell
cd ..\backend
python .\scripts\load_demo_day.py --date 2026-07-01
```

涔熷彲浠ヨ繛缁鍏ュ澶╋細

```powershell
python .\scripts\load_demo_day.py --date 2026-07-01
python .\scripts\load_demo_day.py --date 2026-07-02
python .\scripts\load_demo_day.py --date 2026-07-03
```

瀵煎叆鍚庝細鍦ㄦ湰鍦扮敓鎴?SQLite 鏁版嵁搴撱€傝鏁版嵁搴撳睘浜庤繍琛屼骇鐗╋紝涓嶅簲鎻愪氦鍒?GitHub銆?
## 8. 鍚姩绯荤粺

鍥炲埌椤圭洰鏍圭洰褰曪細

```powershell
cd ..
```

鐩存帴鍚姩锛?
```powershell
.\start.bat
```

鎴栦娇鐢?PowerShell 鍚姩锛?
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\start.ps1
```

濡傛灉闇€瑕佹寚瀹?Python 璺緞锛?
```powershell
$env:PYTHON_EXE = "C:\path\to\python.exe"
.\start.ps1
```

鍚姩鍚庤闂細

- 鍓嶇椤甸潰锛歨ttp://127.0.0.1:3000
- 鍚庣 API锛歨ttp://127.0.0.1:8001
- 鏁版嵁鑾峰彇鎺у埗鏈嶅姟锛歨ttp://127.0.0.1:8787

璇存槑锛?
- 濡傛灉 `frontend/node_modules` 涓嶅瓨鍦紝鍚姩鑴氭湰浼氭彁绀哄厛鎵ц `npm install`銆?- 濡傛灉 `gd-market-crawler/config.local.json` 涓嶅瓨鍦紝鐖櫕鏈嶅姟浼氳嚜鍔ㄨ烦杩囷紝杩欐槸姝ｅ父琛屼负銆?
## 9. 鍋滄绯荤粺

鍦ㄩ」鐩牴鐩綍鎵ц锛?
```powershell
.\stop.ps1
```

## 10. 鏁版嵁鑾峰彇宸ュ叿閰嶇疆

鏁版嵁鑾峰彇宸ュ叿浣嶄簬锛?
```text
gd-market-crawler
```

澶嶅埗閰嶇疆妯℃澘锛?
```powershell
cd gd-market-crawler
Copy-Item .\config.example.json .\config.local.json
```

鐒跺悗鏍规嵁鏈湴鐜濉啓 `config.local.json`銆?
娉ㄦ剰锛?
- `config.local.json` 鍙兘鍖呭惈 UKey 鐧诲綍鍚庣殑 Cookie 鎴栦細璇濅俊鎭€?- 璇ユ枃浠跺凡缁忚 `.gitignore` 鎺掗櫎銆?- 涓嶈灏嗚鏂囦欢涓婁紶鍒?GitHub銆?
鍗曠嫭鍚姩鏁版嵁鑾峰彇鎺у埗鏈嶅姟锛?
```powershell
node .\src\index.js web --config .\config.local.json --port 8787
```

## 11. 椤甸潰鍔熻兘妫€鏌ュ缓璁?
棣栨鍚姩鍚庡缓璁寜浠ヤ笅椤哄簭妫€鏌ワ細

1. 棣栭〉  
   妫€鏌ヤ氦鏄撴棩鐘舵€併€侀闄╂彁绀恒€佸叧閿寚鏍囨槸鍚﹀姞杞姐€?
2. 鐜拌揣妯″潡  
   妫€鏌ュ熀鏈潰鏁版嵁銆佸競鍦哄嚭娓呫€佸垎鏃剁數閲忋€佽繍琛屼笌妫€淇〉闈㈡槸鍚﹀彲鎵撳紑銆?
3. 缃戞灦鎷撴墤  
   妫€鏌ユ嫇鎵戦〉闈€佹椂鍒绘粦鍧椼€佺嚎璺樆濉炶瘑鍒粨鏋滄槸鍚﹀睍绀恒€?
4. 鏁版嵁鑾峰彇  
   妫€鏌ユ暟鎹幏鍙栭〉闈㈡槸鍚﹁兘鎵撳紑銆傛湭閰嶇疆鐖櫕鏃讹紝鏈嶅姟鏈繛鎺ュ睘浜庢甯哥姸鎬併€?
5. 瀵煎叆绠＄悊  
   妫€鏌ュ鍏ョ洰鏍囥€佺増鏈垪琛ㄥ拰鍚屾鍏ュ彛鏄惁鍙敤銆?
6. 鏀跨瓥鏂囦欢  
   妫€鏌ユ斂绛栨枃浠跺垪琛ㄥ拰瑙勫垯瑙ｆ瀽鍔熻兘銆傛湭閰嶇疆澶фā鍨?API Key 鏃讹紝AI 瑙ｈ涓嶅彲鐢ㄥ睘浜庢甯哥姸鎬併€?
7. 涓暱鏈熸ā鍧? 
   寮€婧愮増浠呬繚鐣欏崰浣嶉〉闈紝涓嶅寘鍚鏈変腑闀挎湡棰勬祴鎴栧悎绾︽洸绾跨畻娉曘€?
## 12. 甯歌闂

### 12.1 鍓嶇椤甸潰鎵撲笉寮€

妫€鏌ュ墠绔緷璧栨槸鍚﹀畨瑁咃細

```powershell
cd frontend
npm install
npm run dev
```

### 12.2 鍚庣鎺ュ彛涓嶅彲鐢?
妫€鏌ュ悗绔槸鍚﹀惎鍔細

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

### 12.3 椤甸潰鏄剧ず鏆傛棤鏁版嵁

寮€婧愬寘榛樿涓嶅甫鐪熷疄鏁版嵁锛岄渶瑕佸厛瀵煎叆婕旂ず鏁版嵁锛?
```powershell
cd backend
python .\scripts\load_demo_day.py --date 2026-07-01
```

### 12.4 鏀跨瓥 AI 鍔熻兘涓嶅彲鐢?
妫€鏌ユ槸鍚﹂厤缃細

```env
POLICY_LLM_API_KEY=
POLICY_LLM_MODEL=
```

鏈厤缃椂锛岀郴缁熶細浣跨敤瑙勫垯瑙ｆ瀽鎴栬繑鍥炴湭閰嶇疆鎻愮ず銆?
### 12.5 鏁版嵁鑾峰彇鏈嶅姟鏈惎鍔?
闇€瑕佸厛鍒涘缓锛?
```text
gd-market-crawler/config.local.json
```

鏈垱寤烘椂鍚姩鑴氭湰浼氳烦杩囨暟鎹幏鍙栨帶鍒舵湇鍔°€?
## 13. 鍙戝竷鍓嶆鏌?
涓婁紶 GitHub 鍓嶅缓璁墽琛岋細

```powershell
rg --files | rg "(\.env$|config\.local\.json$|\.db$|\.sqlite$|\.xlsx$|\.csv$|\.log$|\.pkl$|node_modules|\.next|data_samples|downloads)"
rg -n "<local-user-path>|<private-directory>|sk-[A-Za-z0-9_-]{20,}|Bearer\\s+[A-Za-z0-9._-]{20,}" .
```

濡傛灉鏈夌湡瀹炲瘑閽ユ浘缁忚繘鍏?Git 鍘嗗彶锛岄渶瑕佺珛鍗宠疆鎹㈠瘑閽ュ苟娓呯悊 Git 鍘嗗彶銆?
