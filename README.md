<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1tyrOW2jLQfg8mXD61ivwF9jT_F_R2S7a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Enter your Gemini API Key in the homepage input field at runtime (it is not embedded into source code or build config).

## PDF Export Notes

- Export now uses structured PDF rendering (`pdf-lib`) instead of browser print.
- Each web page card maps to exactly one PDF page.
- Chinese serif font is loaded from `public/fonts/` at export time:
  - `NotoSerifCJKsc-Regular.otf`

## Deploy to Vercel

- This repo includes `vercel.json` with:
  - `framework: vite`
  - output directory `dist`
  - SPA fallback routing (`/.* -> /index.html` after filesystem check)
- In Vercel dashboard, import this GitHub repo and keep default build settings.
