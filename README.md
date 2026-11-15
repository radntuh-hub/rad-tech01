# 放射科學生版網站

這份是 **學生播放版**：保留九病例、影片控制與最後一頁的匿名問卷，右上角新增「問 AI」。沒有本機編輯工具。[Cloudflare 網址](https://rad-tech01-student.rad-report-relay.workers.dev)。問答要在 Worker 加入 Gemini 金鑰才會啟用；原有 ChatGPT Sites 網站不受影響。

## 建議部署方式

**GitHub 放原始碼；Cloudflare Worker 同時放網頁、媒體和 API。** 可以先用 Cloudflare 提供的 `workers.dev` 網址，不用購買網域，也不用開 GitHub Pages。已有 Cloudflare 帳號就沿用，不用另外註冊。先用免費方案試小班；Cloudflare 與 Gemini 免費額度是兩回事。

部署前準備：

1. 一個 GitHub 專案，提供網址即可，不要把金鑰或帳號密碼貼到聊天室。
2. 能使用 Workers 的 Cloudflare 帳號，以及一個 Turnstile 元件，限制在學生實際使用的網頁主機名稱。確認正式網址後再設定名稱。
3. 在 Cloudflare Worker 設定 `GEMINI_API_KEY`、`TURNSTILE_SECRET_KEY` 為**秘密值**。Turnstile 的公開 site key 設在 `wrangler.jsonc` 的 `TURNSTILE_SITE_KEY`。未設好時問答不會呼叫 API，教材仍可播放。

維護者可在 GitHub 連接 Cloudflare Workers Builds，或在本機登入 Wrangler 後從本資料夾執行 `npx wrangler deploy`。根目錄是 Workers 專案，只有 `public/` 會對網站訪客提供。請勿將本機編輯器、病例來源或任何金鑰加入 GitHub。預設整個課程共用每日 20 次（UTC 換日，台灣時間上午 8 點）、每分鐘 4 次的 Gemini 請求上限，可依 AI Studio 額度調整；驗證失敗、離題拒答不計入。這不是服務商費用硬上限。

## 若選擇 GitHub Pages 網址

把 `public/` 發布為 GitHub Pages 靜態網站。另將後端發布到 Cloudflare Worker（或另行改接支援後端的服務），並：

- 在 `public/study-config.js` 設 Cloudflare Worker 的 HTTPS 網址，例如 `https://radiology-student-ai.example.workers.dev`。
- 在 `wrangler.jsonc` 的 `FRONTEND_ORIGIN` 設學生端網域來源，例如 `https://teacher.github.io`，不要包含 repo 路徑。
- Turnstile 設定需允許學生端的主機名稱，例如 `teacher.github.io`。Worker 會驗證來源、驗證票證及用量；不是把 Gemini API 直接放前端。

## 資料與試用範圍

問答限定在來自 13 張投影片的通用教學段落。只有通過本機程式規則的問題與選出的段落才會送 Gemini；不會把病例報告、媒體或本機編輯內容放入請求。回覆附經程式核對的原文及來源頁；不能保證 AI 每次解釋都正確。頁面會提示免費方案的資料處理風險；本版不儲存提問或回覆，Cloudflare 只保存共用用量計數。不要輸入病人或個人資訊。先僅供成年學員的概念複習，不用於臨床診療。

驗收：`node --test server/worker.test.mjs` 在無金鑰狀態用模擬服務測試。正式啟用後再用「EDH 和 SDH 有何不同？」及「請教我做蛋糕」確認有來源與離題拒答，並試問卷與影片。

官方文件：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Turnstile 驗證](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[Google Gemini 資料條款](https://ai.google.dev/gemini-api/terms)。
