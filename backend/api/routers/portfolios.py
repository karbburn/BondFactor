from datetime import datetime, timezone
from typing import Dict, List
import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from api.dependencies import get_current_user
from api.schemas import PortfolioCreate, PortfolioUpdate, PortfolioSummary, PortfolioDetail, PositionCreate, PositionResponse
from db.session import get_db
from db.models import Portfolio, PortfolioPosition, Security, ReportGeneration

logger = logging.getLogger(__name__)
router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


def _validate_position(db: Session, security_id: str, face_value: float):
    """Server-side validation per PRD §7.6 / API Spec §3."""
    if face_value <= 0:
        raise HTTPException(422, detail={"code": "VALIDATION_ERROR", "message": "face_value_held must be positive."})

    security = db.query(Security).filter(Security.id == security_id).first()
    if not security:
        raise HTTPException(422, detail={"code": "VALIDATION_ERROR", "message": f"Security {security_id} not found."})
    if not security.is_active:
        raise HTTPException(422, detail={"code": "VALIDATION_ERROR", "message": f"Security {security_id} is not active."})
    return security


# ── Portfolio CRUD ──────────────────────────────────────────────

@router.get("", response_model=list[PortfolioSummary])
def list_portfolios(user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Portfolio, func.count(PortfolioPosition.id).label('position_count'))
        .outerjoin(PortfolioPosition, PortfolioPosition.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == user["id"])
        .group_by(Portfolio.id)
        .all()
    )
    return [
        PortfolioSummary(
            id=p.id, portfolio_name=p.portfolio_name, position_count=count,
            created_at=p.created_at.isoformat(), updated_at=p.updated_at.isoformat(),
        )
        for p, count in rows
    ]


@router.post("", status_code=201, response_model=PortfolioDetail)
def create_portfolio(body: PortfolioCreate, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    now = _now()
    p = Portfolio(user_id=user["id"], portfolio_name=body.portfolio_name, created_at=now, updated_at=now)
    db.add(p)
    db.commit()
    db.refresh(p)
    return PortfolioDetail(id=p.id, portfolio_name=p.portfolio_name, created_at=p.created_at.isoformat(),
                           updated_at=p.updated_at.isoformat(), positions=[])


@router.get("/{portfolio_id}", response_model=PortfolioDetail)
def get_portfolio(portfolio_id: str, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})
    positions = _get_positions(db, p.id)
    return PortfolioDetail(id=p.id, portfolio_name=p.portfolio_name, created_at=p.created_at.isoformat(),
                           updated_at=p.updated_at.isoformat(), positions=positions)


@router.put("/{portfolio_id}", response_model=PortfolioDetail)
def update_portfolio(portfolio_id: str, body: PortfolioUpdate, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})
    p.portfolio_name = body.portfolio_name
    p.updated_at = _now()
    db.commit()
    db.refresh(p)
    positions = _get_positions(db, p.id)
    return PortfolioDetail(id=p.id, portfolio_name=p.portfolio_name, created_at=p.created_at.isoformat(),
                           updated_at=p.updated_at.isoformat(), positions=positions)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: str, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})

    # Collect report file paths before deleting DB records
    reports = db.query(ReportGeneration).filter(ReportGeneration.portfolio_id == p.id).all()
    report_files = [r.storage_path for r in reports if r.storage_path]

    try:
        db.query(ReportGeneration).filter(ReportGeneration.portfolio_id == p.id).delete()
        db.query(PortfolioPosition).filter(PortfolioPosition.portfolio_id == p.id).delete()
        db.delete(p)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(f"Failed to delete portfolio {portfolio_id}")
        raise HTTPException(500, detail={"code": "INTERNAL_SERVER_ERROR", "message": "Failed to delete portfolio"})

    # Best-effort file cleanup — don't fail the request if files are gone
    for path in report_files:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            logger.warning(f"Could not remove report file: {path}")


# ── Position CRUD ───────────────────────────────────────────────

class PositionsReplaceRequest(BaseModel):
    positions: List[PositionCreate]

@router.put("/{portfolio_id}/positions", response_model=list[PositionResponse])
def replace_positions(portfolio_id: str, body: PositionsReplaceRequest, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Atomically replace all positions in a portfolio."""
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})

    # Validate all positions first
    for pos_in in body.positions:
        _validate_position(db, pos_in.security_id, pos_in.face_value_held)

    # Delete existing, add new — single transaction
    db.query(PortfolioPosition).filter(PortfolioPosition.portfolio_id == p.id).delete()
    now = _now()
    results = []
    for pos_in in body.positions:
        pos = PortfolioPosition(
            portfolio_id=p.id, security_id=pos_in.security_id,
            face_value_held=pos_in.face_value_held, position_type="long", added_at=now,
        )
        db.add(pos)
        db.flush()
        sec = db.query(Security).filter(Security.id == pos_in.security_id).first()
        results.append(_position_response(pos, sec))

    p.updated_at = now
    db.commit()
    return results


@router.post("/{portfolio_id}/positions", status_code=201, response_model=PositionResponse)
def add_position(portfolio_id: str, body: PositionCreate, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})

    security = _validate_position(db, body.security_id, body.face_value_held)

    pos = PortfolioPosition(
        portfolio_id=p.id, security_id=body.security_id,
        face_value_held=body.face_value_held, position_type="long", added_at=_now(),
    )
    db.add(pos)
    p.updated_at = _now()
    db.commit()
    db.refresh(pos)
    return _position_response(pos, security)


@router.delete("/{portfolio_id}/positions/{position_id}", status_code=204)
def delete_position(portfolio_id: str, position_id: str, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user["id"]).first()
    if not p:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Portfolio not found."})
    pos = db.query(PortfolioPosition).filter(
        PortfolioPosition.id == position_id, PortfolioPosition.portfolio_id == p.id
    ).first()
    if not pos:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Position not found."})
    db.delete(pos)
    p.updated_at = _now()
    db.commit()


# ── Helpers ─────────────────────────────────────────────────────

def _get_positions(db: Session, portfolio_id: str):
    rows = (
        db.query(PortfolioPosition, Security)
        .join(Security, PortfolioPosition.security_id == Security.id)
        .filter(PortfolioPosition.portfolio_id == portfolio_id)
        .all()
    )
    return [_position_response(pos, sec) for pos, sec in rows]


def _position_response(pos: PortfolioPosition, sec: Security | None):
    if sec is None:
        logger.warning(f"Orphaned position {pos.id}: security {pos.security_id} not found")
    return PositionResponse(
        id=pos.id, security_id=pos.security_id,
        isin=sec.isin if sec else "UNKNOWN",
        security_name=sec.security_name if sec else "Unknown Security",
        face_value_held=float(pos.face_value_held),
        position_type=pos.position_type,
        added_at=pos.added_at.isoformat(),
    )
