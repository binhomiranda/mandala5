from fastapi import FastAPI, APIRouter, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime
from auth import get_current_user
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- INICIALIZAR SUPABASE ----------
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# ---------- FASTAPI ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yantralab.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---------- MODELOS ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# ---------- ROTAS ----------
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

# ---------- ROTA PARA VERIFICAR STATUS ----------
# ---------- ROTA DE STATUS ----------
@api_router.get("/user-status/{email}")
def user_status(email: str):
    res = supabase.table("user_access").select("status").eq("email", email).single().execute()
    if not res.data:
        return {"status": "none"}
    return {"status": res.data.get("status")}

@api_router.get("/protected")
async def protected_route(user=Depends(get_current_user)):
    return {"message": f"Olá, {user['email']}", "plan": user["subscription_plan"]}

# ---------- INCLUIR ROTAS ----------
app.include_router(api_router)

# ---------- LOGGING ----------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
