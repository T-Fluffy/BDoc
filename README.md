# 📝 BDoc — Modern Document Editor

A full-stack, Google-Docs-style document editor with a customizable dark-first UI.

![React](https://img.shields.io/badge/react-19.2-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-5.9-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-8-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-4-%2338B2AC.svg?style=for-the-badge&logo=tailwindcss&logoColor=white)
![TipTap](https://img.shields.io/badge/TipTap-3-%23000000.svg?style=for-the-badge&logo=tiptap&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-10-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-17-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)

## 📸 Demo

| Login | Document Library |
| :---: | :---: |
| ![Login](demo/01-login.png) | ![Library (dark)](demo/02-library-dark.png) |

| Editor (dark) | Settings |
| :---: | :---: |
| ![Editor (dark)](demo/03-editor-dark.png) | ![Settings](demo/04-settings-dark.png) |

| Library (light) | Editor (light) |
| :---: | :---: |
| ![Library (light)](demo/05-library-light.png) | ![Editor (light)](demo/06-editor-light.png) |

## ✨ Features

- **Rich-text editing** (TipTap v3): headings, bold/italic/underline/strike, inline code, highlight, text color, lists, quotes, code blocks, tables, images, links, and alignment.
- **Word compatibility** — import `.docx` files and export documents as `.docx` (HTML ↔ OpenXML on the server). Import preserves fonts, font sizes, colors, highlight, bold/italic/underline/strike, alignment, nested lists, tables, images and links — ready for Microsoft Word / LibreOffice.
- **File menu** — a Word-style `File` menu in the header with New, Import Word, Download as Word, Print / Export to PDF and Close document.
- **Paragraph format** — per-paragraph line spacing, space before / after, left indent and first-line indent from a toolbar dropdown.
- **Page format** — a `Page` menu in the header sets paper size (A5/A4/A3/A2/A1), orientation (portrait/landscape) and margins (narrow/normal/wide). The document is rendered as discrete, paginated paper sheets sized to the chosen format (content flows across visible page breaks). Settings persist per document and are applied to the Word export.
- **Word document simulation** — A4 pages with editable margins, print / PDF export via the browser.
- **Dark theme by default**, fully customizable:
  - Light/dark toggle
  - Accent color (10 presets + custom picker)
  - Editor font (sans / serif / mono)
  - Preferences persist in `localStorage`.
- **Document library** backed by a real REST API — create, edit, autosave, delete.

## 🧱 Architecture

```
BDoc/
├── docker-compose.yml     # Full stack: postgres + backend + frontend
├── backend/               # ASP.NET Core 10 (Clean Architecture)
│   ├── BDoc.sln
│   ├── BDoc               # Web API host
│   ├── BDoc.Domain        # Entities & interfaces
│   ├── BDoc.Application   # Application layer
│   └── BDoc.Infrastructure# EF Core 10 + PostgreSQL, repositories, migrations
└── frontend/              # React 19 + Vite 8 + Tailwind 4 + TipTap 3
```

## 🚀 Quick Start (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080/api/documents (Swagger at `/swagger`)
- The API is proxied through the frontend under `/api`, so the UI never talks cross-origin in production.

Migrations are applied automatically on startup, and a Postgres 17 volume persists data between runs.

## 💻 Local Development

### Backend

Requires the **.NET 10 SDK** and a running Postgres.

```bash
cd backend
dotnet ef database update   # apply migrations (optional; app migrates on startup)
dotnet run                  # http://localhost:8080
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev                 # http://localhost:5173 (proxies /api -> localhost:8080)
```

## 🛠️ Scripts

| Command               | Purpose                        |
| --------------------- | ------------------------------ |
| `docker compose up`   | Run the full stack             |
| `npm run dev`         | Vite dev server (frontend)     |
| `npm run build`       | Typecheck + production build   |
| `npm run lint`        | ESLint                         |
| `dotnet build`        | Build backend solution         |

## 🗺️ Roadmap

- JWT-based authentication
- Real-time collaboration (SignalR) & live cursors
- Markdown import/export