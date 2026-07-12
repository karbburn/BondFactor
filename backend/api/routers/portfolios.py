from datetime import datetime, timezone
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from api.dependencies import get_current_user
from api.schemas import PortfolioCreate, PortfolioUpdate, PortfolioSummary, PortfolioDetail, PositionCreate, PositionResponse
from db.session import get_db
from db.models import Portfolio, PortfolioPosition, Security, ReportGeneration

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
    db.query(ReportGeneration).filter(ReportGeneration.portfolio_id == p.id).delete()
    db.query(PortfolioPosition).filter(PortfolioPosition.portfolio_id == p.id).delete()
    db.delete(p)
    db.commit()


# ── Position CRUD ───────────────────────────────────────────────

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
    return PositionResponse(
        id=pos.id, security_id=pos.security_id,
        isin=sec.isin if sec else "UNKNOWN",
        security_name=sec.security_name if sec else "Unknown Security",
        face_value_held=float(pos.face_value_held),
        position_type=pos.position_type,
        added_at=pos.added_at.isoformat(),
    )
