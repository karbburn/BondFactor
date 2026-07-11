import os
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from db.session import get_db
from db.models import Portfolio, PortfolioPosition, ReportGeneration
from api.schemas import ReportGenerateRequest, ReportResponse
from api.dependencies import get_current_user
from services.report_generator import generate_report, REPORTS_DIR

router = APIRouter()


@router.post("/generate", response_model=ReportResponse, status_code=202)
def create_report(
    req: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.format not in ("pdf", "xlsx"):
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "format must be 'pdf' or 'xlsx'"})

    if not req.scenarios:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "At least one scenario is required"})

    # Verify portfolio exists and user owns it
    portfolio = db.query(Portfolio).filter(Portfolio.id == req.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Portfolio not found"})
    if portfolio.user_id != user["id"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Portfolio not found"})

    # Verify portfolio has positions
    pos_count = db.query(PortfolioPosition).filter(PortfolioPosition.portfolio_id == req.portfolio_id).count()
    if pos_count == 0:
        raise HTTPException(status_code=422, detail={"code": "VALIDATION_ERROR", "message": "Portfolio has no positions"})

    from datetime import datetime, timezone
    rec = ReportGeneration(
        user_id=user["id"],
        portfolio_id=req.portfolio_id,
        format=req.format,
        scenario_config=[s.model_dump() for s in req.scenarios],
        status="processing",
        created_at=datetime.now(timezone.utc),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    background_tasks.add_task(generate_report, rec.id, db)

    return ReportResponse(
        report_id=rec.id,
        status="processing",
        download_url=None,
    )


@router.get("/{report_id}", response_model=ReportResponse)
def get_report_status(
    report_id: str,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = db.query(ReportGeneration).filter(ReportGeneration.id == report_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Report not found"})
    if rec.user_id != user["id"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Report not found"})

    download_url = None
    if rec.status == "completed" and rec.storage_path:
        download_url = f"/api/v1/reports/{report_id}/download"

    return ReportResponse(
        report_id=rec.id,
        status=rec.status,
        download_url=download_url,
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: str,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi.responses import FileResponse

    rec = db.query(ReportGeneration).filter(ReportGeneration.id == report_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Report not found"})
    if rec.user_id != user["id"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Report not found"})
    if rec.status != "completed" or not rec.storage_path:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Report not ready"})

    media = "application/pdf" if rec.format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    filename = f"bondfactor_report_{report_id[:8]}.{rec.format}"
    return FileResponse(rec.storage_path, media_type=media, filename=filename)
