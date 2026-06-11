# TubeSaver - Tech Stack & Production Orchestration

TubeSaver is an optimized, portfolio-grade YouTube video and audio playlist downloader. It features dual architectural builds:
1. **Interactive Demo Environment (Workspace Ready):** Fully integrated React+Express server delivering simulated real-time WebSocket progress updates and fully detailed layout mockups so it runs out-of-the-box in server environments.
2. **Production Containerized Environment (Docker Ready):** Enterprise-ready Python FastAPI backend integrated asynchronously with `yt-dlp` and `ffmpeg` pipelines for live conversions, paired with an Nginx static web container for the compiled React frontend.

---

## Technical Stack Overview
- **Frontend App:** React 19 (Vite) / TypeScript / Tailwind CSS
- **Local Workspace Server:** Node.js Express / WebSocket (`ws` engine) on Port 3000
- **Production Backend API:** Python FastAPI / `yt-dlp` / System `ffmpeg` utility binaries on Port 8000
- **Production Web Server:** Nginx web containers on Port 80
- **Containerization Systems:** Docker Multi-stage containers + Docker Compose

---

## 🚀 Docker Compose Setup (Recommended)
Docker Compose builds the entire stack, installs system utilities, pulls package nodes, and establishes safe persistent directories for your downloads.

### 1. Requirements
Ensure you have Docker and Docker Compose installed:
- [Install Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Launch Stack
At the root folder directory of the application, simply run:
```bash
docker-compose up --build
```

This single command:
1. Builds the FastAPI Python container `backend` and installs `ffmpeg` on port 8000.
2. Builds the React static files and compiles them into Nginx standard ports 80.
3. Automatically mounts a local directory named `./downloads` directly in your workspace so files saved are persistent.

### 3. Verification
Once complete, open:
- Frontend Client: `http://localhost` (or `http://localhost:80`)
- Backend Dev Swagger docs: `http://localhost:8000/docs`

---

## 🛠️ Individual Local Setup (Without Docker)

### 1. Run Backend FastAPI (Python)
Ensure Python 3.10+ and system `ffmpeg` are installed.

```bash
# Navigate to backend and setup virtualenv
cd backend
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows

# Install python requirements
pip install -r requirements.txt

# Start FastAPI development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Run Headless Frontend (Node.js React)
```bash
# Install NPM dependencies
npm install

# Run static dev server (proxying to backend endpoints)
npm run dev
```

---

## 📁 Architecture Directory Design

```text
├── backend/                  # Production Python Backend API
│   ├── app/
│   │   └── main.py           # Core FastAPI application with yt-dlp pipelines
│   ├── Dockerfile            # Multi-stage automated FFmpeg python builder
│   └── requirements.txt      # Python libraries catalog
│
├── src/                      # Modurly split frontend screens
│   ├── components/
│   │   ├── TopNavBar.tsx     # Unified Header links
│   │   ├── HistoryPage.tsx   # Persistent LocalStorage dashboard
│   │   ├── DownloadProgressList.tsx   # Active live download streams
│   │   ├── PreviewSetupCard.tsx       # Config resolution forms
│   │   └── PlaylistsSetupCard.tsx     # Batch togglers
│   ├── types.ts              # Absolute interfaces and DTO fields
│   ├── App.tsx               # Primary hooks & WS coordinator
│   └── index.css             # Embedded Inter & Space Grotesk fonts
│
├── server.ts                 # Dev Workspace Express unified router
├── docker-compose.yml        # Multi-container local orchestration script
└── package.json              # NPM script and libraries lists
```
