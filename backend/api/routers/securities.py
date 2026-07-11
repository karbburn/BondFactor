from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional

from db.session import get_db
from db.models import Security
from api.schemas import SecurityResponse

router = APIRouter()

@router.get("", response_model=List[SecurityResponse])
def get_securities(
    active_only: bool = True,
    maturity_after: Optional[date] = None,
    maturity_before: Optional[date] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Security)
    if active_only:
        query = query.filter(Security.is_active == True)
    if maturity_after:
        query = query.filter(Security.maturity_date >= maturity_after)
    if maturity_before:
        query = query.filter(Security.maturity_date <= maturity_before)
        
    securities = query.all()
    return [format_security_response(s) for s in securities]

@router.get("/{isin}", response_model=SecurityResponse)
def get_security_by_isin(isin: str, db: Session = Depends(get_db)):
    security = db.query(Security).filter(Security.isin == isin).first()
    if not security:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active security found for the given ISIN."
        )
    return format_security_response(security)

def format_security_response(s: Security) -> SecurityResponse:
    return SecurityResponse(
        id=s.id,
        isin=s.isin,
        security_name=s.security_name,
        issue_date=s.issue_date,
        maturity_date=s.maturity_date,
        coupon_rate=float(s.coupon_rate),
        coupon_frequency=int(s.coupon_frequency),
        face_value=float(s.face_value),
        benchmark_tenor_classification=s.benchmark_tenor_classification,
        is_active=s.is_active
    )
