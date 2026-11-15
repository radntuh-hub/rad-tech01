# 放射科學生版網站

這份是 **學生播放版**：保留九病例、影片控制與最後一頁的匿名問卷，右上角新增「問 AI」。沒有本機編輯工具。[Cloudflare 網址](https://rad-tech01-student.rad-report-relay.workers.dev)。問答要在 Worker 加入 Gemini 金鑰才會啟用；原有 ChatGPT Sites 網站不受影響。

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

可問教材與一般知識。教材題會參考從 13 張投影片選出的通用教學段落，並附經程式核對的原文與來源頁；其他回答會標示「一般知識（非教材引用）」，不搜尋網路。不會把病例報告、媒體或本機編輯內容放入請求。頁面會提示免費方案的資料處理風險；本版不儲存提問或回覆，不再以 Cloudflare 計數。不要輸入病人或個人資訊。先僅供成年學員，不用於臨床診療。

明確要求整理「教材／投影片」時，只根據可用的教材段落回答，不以一般知識代答。常用的「教材中有哪些腦出血類型」是跨病例總覽，直接從既有段落列出 EDH、SDH、SAH、hemorrhagic contusion，並另外列出 DAI 課堂提到的 microbleeds，不需要 Gemini 額度。

驗收：`node --test server/worker.test.mjs` 在無金鑰狀態用模擬服務測試。正式啟用後再測「EDH 和 SDH 有何不同？」（教材引用）與「什麼是光合作用？」（一般知識），並試問卷與影片。

官方文件：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Google Gemini 資料條款](https://ai.google.dev/gemini-api/terms)。
