# backend/server.py
from fastapi import FastAPI, APIRouter, Depends, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import os
import uuid
import logging

from auth import get_current_user
from supabase import create_client, Client

# ---------- ENV & SUPABASE ----------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role só no backend

if not SUPABASE_URL or not SUPABASE_KEY:
    # Mensagem explícita p/ log do Render
    raise RuntimeError(
        "Ambiente inválido: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Render (Env Group)."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------- FASTAPI ----------
app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- CORS ----------
ALLOWED_ORIGINS = [
    "https://yantralab.netlify.app",
    "http://localhost:5173",  # dev opcional
    "http://127.0.0.1:5173",  # dev opcional
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=None,         # ou use um regex se tiver múltiplos subdomínios
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],             # inclui Authorization
)

# ---------- MODELOS ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# ---------- ROTAS ----------
@api.get("/")
async def root():
    return {"message": "OK"}

@api.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    # Removido uso de "db" (não existe). Se quiser persistir no Supabase:
    status_obj = StatusCheck(client_name=input.client_name)
    try:
        _ = supabase.table("status_checks").insert(status_obj.dict()).execute()
    except Exception as e:
        # não derrube o servidor por erro de insert
        raise HTTPException(status_code=500, detail=f"Falha ao salvar status: {e}")
    return status_obj

@api.get("/user-status/{email}")
def user_status(email: str):
    # Espera receber o e-mail URL-encoded vindo do front
    try:
        res = (
            supabase.table("user_access")
            .select("status")
            .eq("email", email)
            .single()
            .execute()
        )
    except Exception as e:
        # se .single() não achar, a SDK pode lançar; tratamos aqui
        return {"status": "none"}

    data = res.data or {}
    return {"status": data.get("status", "none")}

@api.get("/protected")
async def protected_route(user=Depends(get_current_user)):
    return {"message": f"Olá, {user['email']}", "plan": user["subscription_plan"]}

# ---------- INCLUIR ROTAS ----------
app.include_router(api)

# ---------- LOGGING ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("mandala5")

# (opcional) nada a fechar no shutdown; removido handler que referia "client"
