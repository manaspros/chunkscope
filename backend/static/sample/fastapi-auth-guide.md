# FastAPI Authentication Guide

## Overview

This guide covers implementing JWT-based authentication in FastAPI applications. We'll build a complete auth system with user registration, login, token refresh, and role-based access control.

## Prerequisites

- Python 3.11+
- FastAPI 0.109+
- SQLAlchemy 2.0+
- python-jose for JWT
- passlib for password hashing

## Installation

```bash
pip install fastapi uvicorn sqlalchemy python-jose[cryptography] passlib[bcrypt]
```

## Project Structure

```
auth_project/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   └── dependencies.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py
│   └── core/
│       ├── __init__.py
│       ├── config.py
│       ├── database.py
│       └── security.py
├── tests/
│   └── test_auth.py
└── requirements.txt
```

## Step 1: Database Models

### User Model

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### Database Configuration

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/authdb"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

## Step 2: Security Utilities

### Password Hashing

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
```

### JWT Token Management

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt

SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
```

## Step 3: Authentication Endpoints

### Schemas

```python
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    is_active: bool

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenRefresh(BaseModel):
    refresh_token: str
```

### Router

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
    )
    db.add(user)
    await db.flush()
    return user

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    return Token(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )
```

## Step 4: Protected Routes

### Dependency for Current User

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    user_id = payload.get("sub")
    user = await get_user_by_id(db, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user
```

### Using the Dependency

```python
@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/admin-only")
async def admin_endpoint(current_user: User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return {"message": "Welcome, admin!"}
```

## Step 5: Testing

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    # Register
    response = await client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "securepassword123",
        "full_name": "Test User",
    })
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
    
    # Login
    response = await client.post("/auth/login", data={
        "username": "test@example.com",
        "password": "securepassword123",
    })
    assert response.status_code == 200
    tokens = response.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
```

## Common Pitfalls

1. **Never store plain-text passwords** - Always use bcrypt or argon2
2. **Keep JWT secrets secure** - Use environment variables, not hardcoded strings
3. **Set appropriate token expiry** - Access tokens: 15-30 min, Refresh tokens: 7-30 days
4. **Validate token type** - Check if the token is an access or refresh token
5. **Handle token revocation** - Use a blacklist or short-lived tokens with refresh rotation

## Performance Considerations

| Approach | Latency | Scalability | Complexity |
|----------|---------|-------------|------------|
| Session-based | Low | Requires sticky sessions | Low |
| JWT stateless | Very low | Horizontally scalable | Medium |
| JWT + Redis blacklist | Low | Horizontally scalable | High |
| OAuth2 + OIDC | Medium | Provider-dependent | High |

For most FastAPI applications, stateless JWT with short expiry (15 min) and refresh token rotation provides the best balance of security and performance.
