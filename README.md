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
