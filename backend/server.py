# backend/server.py
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
import os, uuid, logging

from auth import get_current_user
from supabase import create_client, Client

# ---------- LOGGING ----------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("mandala5")

# ---------- APP ----------
app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- CORS ----------
ALLOWED_ORIGINS = [
    "https://yantralab.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- SUPABASE (em app.state) ----------
def create_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role só no backend
    if not url or not key:
        # Log claro no Render; não vaza a chave inteira
        log.error("Env faltando: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY ausentes.")
        raise RuntimeError("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Render/Env Group")
    log.info(f"SUPABASE_URL OK; SERVICE_ROLE_KEY prefix: {key[:6]}******")
    return create_client(url, key)

@app.on_event("startup")
def on_startup():
    app.state.supabase = create_supabase_client()
    log.info("Supabase client inicializado.")

def get_supabase(request: Request) -> Client:
    return request.app.state.supabase

# ---------- MODELOS ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# ---------- ROTAS ----------
@api.get("/")
def root():
    return {"message": "OK"}

@api.post("/status", response_model=StatusCheck)
def create_status_check(input: StatusCheckCreate, supabase: Client = Depends(get_supabase)):
    obj = StatusCheck(client_name=input.client_name)
    try:
        supabase.table("status_checks").insert(obj.dict()).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar status: {e}")
    return obj

@api.get("/user-status/{email}")
def user_status(email: str, supabase: Client = Depends(get_supabase)):
    # Chame do front com encodeURIComponent(email)
    try:
        res = supabase.table("user_access").select("status").eq("email", email).single().execute()
        data = res.data or {}
        return {"status": data.get("status", "none")}
    except Exception:
        # Quando não encontra/erro, devolve "none" (evita 500)
        return {"status": "none"}

@api.get("/protected")
def protected_route(user=Depends(get_current_user)):
    return {"message": f"Olá, {user['email']}", "plan": user["subscription_plan"]}

app.include_router(api)
