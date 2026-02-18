# AItranslator

PDF translation workspace with:

- Hierarchical typography reconstruction
- Image translation retry
- Chat in three scopes (document/page/selection)
- Professional bilingual reading mode (English source on left, Chinese translation on right)
- Sentence-level cross highlight (select Chinese sentence to highlight aligned English sentence)
- Selection highlight + annotations
- Supabase auth, database, and private storage

## 1. Install

```bash
npm install
```

## 2. Configure Supabase

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then run SQL in Supabase SQL Editor:

- `supabase/schema.sql`

This creates tables, indices, storage bucket, and RLS policies (owner-only access).

## 3. Run

```bash
npm run dev
```

## 4. Build

```bash
npm run build
```

## Notes

- Gemini API key is entered at runtime in UI.
- All document/chat/annotation data is user-private through RLS.
- PDF export outputs translation pages only.
