# 放射科學生版網站

這份是 **學生播放版**：保留九病例及影片控制，每個病例的末頁都有匿名問卷，右上角有「問 AI」。沒有本機編輯工具。[Cloudflare 網址](https://rad-tech01-student.rad-report-relay.workers.dev)。問答要在 Worker 加入 Gemini 金鑰才會啟用；原有 ChatGPT Sites 網站不受影響。

## 建議部署方式

**GitHub 放原始碼；Cloudflare Worker 同時放網頁、媒體和 API。** 可以先用 Cloudflare 提供的 `workers.dev` 網址，不用購買網域，也不用開 GitHub Pages。已有 Cloudflare 帳號就沿用，不用另外註冊。先用免費方案試小班；Cloudflare 與 Gemini 免費額度是兩回事。

部署前準備：

1. 一個 GitHub 專案，提供網址即可，不要把金鑰或帳號密碼貼到聊天室。
2. 能使用 Workers 的 Cloudflare 帳號。
3. 在 Cloudflare Worker 設定 `GEMINI_API_KEY` 為**秘密值**。未設好時問答不會呼叫 API，教材仍可播放。學生不需要 CAPTCHA 或登入。

維護者可在 GitHub 連接 Cloudflare Workers Builds，或在本機登入 Wrangler 後從本資料夾執行 `npx wrangler deploy`。根目錄是 Workers 專案，只有 `public/` 會對網站訪客提供。請勿將本機編輯器、病例來源或任何金鑰加入 GitHub。網站不另設每分鐘或每日問答上限；Google 回傳用量限制時只顯示提示，不自動重試。沒有使用者驗證，因此任何能開啟網站的人都可能消耗共用額度；請在 AI Studio 確認你的專案方案。

## 若選擇 GitHub Pages 網址

把 `public/` 發布為 GitHub Pages 靜態網站。另將後端發布到 Cloudflare Worker（或另行改接支援後端的服務），並：

- 在 `public/study-config.js` 設 Cloudflare Worker 的 HTTPS 網址，例如 `https://radiology-student-ai.example.workers.dev`。
- 在 `wrangler.jsonc` 的 `FRONTEND_ORIGIN` 設學生端網域來源，例如 `https://teacher.github.io`，不要包含 repo 路徑。
- Worker 會核對瀏覽器來源；瀏覽器來源檢查不是身分驗證，也不會把 Gemini 金鑰放前端。

## 資料與試用範圍

可問教材與一般知識。九個章節的 90 頁皆納入網站的教材搜尋：只查「在哪一頁」會直接連到真實投影片，不需呼叫 Gemini。同時要求補充時，會一併提供說明；模型暫時無法回答時，仍保留找到的頁面。81 頁有核對過的教學摘錄，可由 Gemini 解說並在「教材對照」附上原文與來源頁。9 頁 English report 可以搜尋章節與頁面，原文只在投影片上閱讀。一般知識另外標示，不搜尋網路。

模型解說會將提問及相關教學摘錄送給 Google Gemini，但不傳送病例報告原文、病人背景段落、媒體或整份索引。學生頁面提醒不要輸入個資、病人資料或機密；本站不儲存提問或回覆，不再以 Cloudflare 計數。先僅供成年學員，不用於臨床診療。

提問提到「教材」時優先找原文；找不到足夠依據仍可給一般解釋，但會清楚區分來源。明說「只依教材」才會停用一般補充。「這頁在講什麼？」會參考目前投影片可用的摘錄；若在病例報告頁，會導回原頁，不會假裝已讀取。常用的「教材中有哪些腦出血類型」是跨病例總覽，直接從既有段落列出 EDH、SDH、SAH、hemorrhagic contusion，並另外列出 DAI 課堂提到的 microbleeds，不需要 Gemini 額度。

問教材如何分類 Encephalomalacia 時，會直接對照 Contusion / SAH 第 7、8 頁，說明這裡教的是病程時間軸，而不是病理亞型。這個對照不需要 Gemini 額度。

修改投影片後，檢查 `server/course-excerpts.tsv`（原有摘錄在 `server/corpus.json`），只加入可提供給 Gemini 的教學摘錄。用 `python3 scripts/build-course-index.py` 重新產生索引，再用 `node --test server/*.test.mjs` 驗證 HTML、索引、問答與問卷。正式站可試問「教材的 throat symptoms 或 mass 是在哪一頁？」。

官方文件：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Google Gemini 資料條款](https://ai.google.dev/gemini-api/terms)。

## 教師影片標註

網路教師入口為 `/teacher/`。教師密碼可編輯共用草稿；管理者密碼另外提供發布與復原上一版。學生不需登入，只有重新載入後才會讀到最近一次已確認發布的箭頭。教師正在編輯的內容不公開；若另一位教師先更新，請先下載自己的標註再整理衝突。兩種角色目前各使用一組密碼，未建立個別帳號。

按「編輯內容」後，點投影片文字即可直接打字，也可使用上方「修改文字」欄位。選取後拖曳旁邊的「移動」把手，就能調整文字或圖片位置；亦保留「拖曳移動」按鈕。可調整字級、顏色、粗體，並支援復原、重做（Ctrl/Cmd+Z、Shift+Ctrl/Cmd+Z）。

按「新增文字方塊」會在目前投影片加入可直接輸入的文字，可換行、移動、設定格式；「刪除文字方塊」只刪除選取的新增方塊，也可復原。完成後按「儲存草稿」，重新開啟仍會保留；管理者另按「發布到學生版」才會公開。離開有未儲存修改的頁面時會提醒。

圖片／影片縮放：在「編輯內容」中選取圖片，或按影片下方「調整影片大小」。使用「影像尺寸」滑桿、加減按鈕或「縮放百分比」輸入 25–200%；100% 是該畫面原本的顯示尺寸，不是原始影像的像素大小。寬高永遠等比例調整，放大最多填滿所在欄位，不裁切影像、不改動原始媒體檔案。圖片與影片上的箭頭會跟著縮放，影片播放速度及逐格操作保持原狀；同一播放器切換序列時沿用設定。可按「還原尺寸」回到原排版，縮放同樣支援復原、重做、儲存草稿和發布，學生版會套用已發布的尺寸而不顯示編輯工具。

選取圖片後可用「在圖片畫箭頭」標註；箭頭跟隨圖片移動及縮放，也會顯示在放大檢視。標題會同步目錄與下拉選單。寬度 540px 以下會保留原本排版、不套用手動位移，新增文字改依序排列，避免在手機上重疊。表格儲存格、圖說等結構內文字可修改，但不獨立拖離原結構。網路版不開放上傳或替換媒體；教材問答仍使用原本核對過的摘錄，不會把教師草稿或在線改寫的內容傳給 Gemini。

部署使用 SQLite Durable Object，不把草稿寫回靜態 HTML。維護者用 `node annotation/provision.mjs 私人新資料夾` 建立兩組高強度密碼與雜湊。只將 `teacher-secrets.json` 透過 Wrangler 的 `deploy --secrets-file` 設為秘密值，不要將它或登入資料放進 GitHub、網站資源或教師 ZIP。密碼輪換後舊登入會失效。影片或投影片影片配置改動時，先備份及核對標註，再用 `node annotation/build.mjs manifest` 更新驗證清單。

從這個資料夾執行 `node annotation/build.mjs teacher 輸出資料夾`，產生獨立離線教師包。輸出名稱須為新資料夾。教師用 Chrome 或 Edge 開啟 `開啟教師標註.html`，按影片下方的「畫箭頭」，完成後按「下載標註」。只需收回 JSON，無需收回媒體。

收件後可執行 `node annotation/build.mjs preview 預覽資料夾 標註1.json 標註2.json`。預覽僅播放、不包含編輯或雲端問答，並核對影片內容與影格、頁面位置；同一支箭頭若有不同版本會拒絕覆蓋。此步驟不部署、不改寫既有學生版。若要發布，先確認箭尖與每一段顯示範圍，再將核定標註與播放層整合到學生版，保留 AI 與問卷。
