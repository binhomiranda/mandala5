# backend/auth.py
import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from supabase import create_client, Client
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_ANON_KEY")
)

JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        email = payload.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Token inválido")

        res = supabase.table("user_access").select("*").eq("email", email).single().execute()
        if not res.data or res.data.get("status") != "active":
            raise HTTPException(status_code=403, detail="Acesso negado")

        return res.data
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")