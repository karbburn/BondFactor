from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging
import os

logger = logging.getLogger(__name__)

from api.routers import curves, securities, portfolios, reports, scenarios, internal

app = FastAPI(
    title="BondFactor API",
    description="Indian Government Securities yield curve deformation and portfolio risk platform.",
    version="1.0.0"
)

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "https://bondfactor.vercel.app,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

# Global Exception Handlers for consistent Error Envelope
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    status_code = exc.status_code
    code_map = {
        status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_403_FORBIDDEN: "FORBIDDEN",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_422_UNPROCESSABLE_ENTITY: "VALIDATION_ERROR",
        status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR"
    }
    
    # Default code and message
    code = code_map.get(status_code, "SERVER_ERROR")
    message = exc.detail
    details = {}
    
    # If the detail was raised as a dict (e.g., detail={"code": ..., "message": ...}), extract fields
    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", code)
        message = exc.detail.get("message", message)
        details = exc.detail.get("details", {})
        
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": str(message),
                "details": details
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Validation failed for request parameters or body.",
                "details": {"errors": exc.errors()}
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected server error occurred.",
            }
        }
    )

# Register routers with /api/v1 prefix
app.include_router(curves.router, prefix="/api/v1", tags=["Curves"])
app.include_router(securities.router, prefix="/api/v1/securities", tags=["Securities"])
app.include_router(portfolios.router, prefix="/api/v1/portfolios", tags=["Portfolios"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(scenarios.router, prefix="/api/v1/scenarios", tags=["Scenarios"])
app.include_router(internal.router, prefix="/api/v1/internal", tags=["Internal"])

@app.get("/")
def read_root():
    return {"message": "BondFactor API is running"}
