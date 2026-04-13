# ResuMatch AI 🚀

ResuMatch AI is an AI-powered resume parsing and job-matching platform that leverages NVIDIA NIM models, FastAPI, and Next.js to dynamically match candidates with tailored job recommendations and auto-generate personalized cover letters.

## Architecture

This structured monorepo is divided into two discrete components:

* **/frontend:** A Next.js (React) front-end web application powering the Dashboard, Job Matches UI, and the dynamic Cover Letter modal generator. Contains `app/`, `src/components/`, etc.
* **/backend:** A FastAPI Python service providing intelligent backend REST processing, Supabase persistence logic, embedding search, and external integrations with NVIDIA APIs.

---

## 🔑 Environment Variables Setup

Security is configured so your explicit `.env` files are ignored by git. Before running, securely duplicate and fill out the `.env` templates inside each respective directory.

1. **Frontend Configuration**
   ```bash
   cp frontend/.env.example frontend/.env
   # Add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY inside frontend/.env
   ```

2. **Backend Configuration**
   ```bash
   cp backend/.env.example backend/.env
   # Add your DATABASE_URL, Supabase Keys, and NVIDIA_API_KEY_* inside backend/.env
   ```

---

## 💻 Local Development (Running Separately)

To properly develop, you must boot both servers simultaneously in two isolated terminal windows.

### Terminal 1: Boot the FastAPI Backend
```shell
cd backend
python -m venv venv
source venv/bin/activate  # Or `.\venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```
*Backend runs on `http://localhost:8000`*

### Terminal 2: Boot the Next.js Frontend
```shell
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`*

---

## 🐳 Docker Deployment (Production)

To deploy the entire stack immediately, avoid managing instances and use Docker. Ensure Docker Desktop is installed.

From the absolute **root** of the repository, execute:
```shell
docker-compose up -d --build
```

Docker will:
1. Orchestrate an Alpine instance compiling the static standalone `frontend`.
2. Construct a Python slim cache downloading dependencies for the `backend`.
3. Auto-network both together cleanly.
4. Expose the Application to `http://localhost:3000`.
