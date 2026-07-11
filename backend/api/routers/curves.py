from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional

from db.session import get_db
from db.models import CurveCalibration, KeyRateTenorGrid, ReferenceZeroCurve
from api.schemas import CurveResponse, CurveSummary, KeyRateTenorResponse, TenorItem, NSSParametersSchema, CurveDiagnostics, ArchivedDateItem, ZeroCurvePoint

router = APIRouter()

@router.get("/curves/latest", response_model=CurveResponse)
def get_latest_curve(db: Session = Depends(get_db)):
    calibration = (
        db.query(CurveCalibration)
        .filter(CurveCalibration.is_active == True)
        .order_by(CurveCalibration.curve_date.desc())
        .first()
    )
    if not calibration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active curve calibrations found."
        )
    return format_curve_response(calibration)

@router.get("/curves/history", response_model=List[CurveSummary])
def get_curve_history(
    start: Optional[date] = None,
    end: Optional[date] = None,
    db: Session = Depends(get_db)
):
    query = db.query(CurveCalibration).filter(CurveCalibration.is_active == True)
    if start:
        query = query.filter(CurveCalibration.curve_date >= start)
    if end:
        query = query.filter(CurveCalibration.curve_date <= end)
        
    calibrations = query.order_by(CurveCalibration.curve_date.desc()).all()
    return [
        CurveSummary(
            curve_date=c.curve_date,
            model_type=c.model_type,
            validation_status=c.validation_status
        )
        for c in calibrations
    ]

@router.get("/curves/{date_val}", response_model=CurveResponse)
def get_curve_by_date(date_val: date, db: Session = Depends(get_db)):
    calibration = (
        db.query(CurveCalibration)
        .filter(CurveCalibration.curve_date == date_val, CurveCalibration.is_active == True)
        .first()
    )
    if not calibration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active curve calibration found for date {date_val}."
        )
    return format_curve_response(calibration)

@router.get("/key-rate-tenors", response_model=KeyRateTenorResponse)
def get_key_rate_tenors(db: Session = Depends(get_db)):
    tenors = db.query(KeyRateTenorGrid).order_by(KeyRateTenorGrid.tenor_years.asc()).all()
    
    if not tenors:
        # Fallback to default tenors if DB grid is not seeded
        default_tenors = [
            TenorItem(label="91D", years=0.25),
            TenorItem(label="182D", years=0.5),
            TenorItem(label="1Y", years=1.0),
            TenorItem(label="2Y", years=2.0),
            TenorItem(label="3Y", years=3.0),
            TenorItem(label="5Y", years=5.0),
            TenorItem(label="7Y", years=7.0),
            TenorItem(label="10Y", years=10.0),
            TenorItem(label="15Y", years=15.0),
            TenorItem(label="20Y", years=20.0),
            TenorItem(label="30Y", years=30.0),
            TenorItem(label="40Y", years=40.0)
        ]
        return KeyRateTenorResponse(
            effective_date=date(2026, 7, 1),
            tenors=default_tenors
        )
        
    effective_date = tenors[0].effective_date if tenors else date(2026, 7, 1)
    return KeyRateTenorResponse(
        effective_date=effective_date,
        tenors=[TenorItem(label=t.tenor_label, years=float(t.tenor_years)) for t in tenors]
    )

@router.get("/curves/history/dates", response_model=List[ArchivedDateItem])
def get_archived_dates(db: Session = Depends(get_db)):
    """Returns all dates that have archived zero curve data."""
    rows = (
        db.query(
            CurveCalibration.curve_date,
            CurveCalibration.model_type,
            CurveCalibration.validation_status,
        )
        .join(ReferenceZeroCurve, ReferenceZeroCurve.calibration_id == CurveCalibration.id)
        .filter(CurveCalibration.is_active == True)
        .distinct()
        .order_by(CurveCalibration.curve_date.desc())
        .all()
    )
    result = []
    for curve_date, model_type, validation_status in rows:
        count = db.query(ReferenceZeroCurve).filter(
            ReferenceZeroCurve.curve_date == curve_date
        ).count()
        result.append(ArchivedDateItem(
            curve_date=curve_date,
            model_type=model_type,
            validation_status=validation_status,
            point_count=count,
        ))
    return result

@router.get("/curves/{date_val}/zero-curve", response_model=List[ZeroCurvePoint])
def get_zero_curve_by_date(date_val: date, db: Session = Depends(get_db)):
    """Returns the bootstrapped zero curve points for a specific date."""
    points = (
        db.query(ReferenceZeroCurve)
        .filter(ReferenceZeroCurve.curve_date == date_val)
        .order_by(ReferenceZeroCurve.tenor_years.asc())
        .all()
    )
    if not points:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No archived zero curve data found for date {date_val}."
        )
    return [
        ZeroCurvePoint(
            tenor_years=float(p.tenor_years),
            zero_rate=float(p.zero_rate),
            discount_factor=float(p.discount_factor),
        )
        for p in points
    ]

def format_curve_response(calibration: CurveCalibration) -> CurveResponse:
    parameters = None
    if calibration.model_type == "nss":
        parameters = NSSParametersSchema(
            beta0=float(calibration.beta0),
            beta1=float(calibration.beta1),
            beta2=float(calibration.beta2),
            beta3=float(calibration.beta3),
            tau1=float(calibration.tau1),
            tau2=float(calibration.tau2)
        )
        
    diagnostics = CurveDiagnostics(
        optimizer_converged=calibration.optimizer_converged,
        fit_residual_error=float(calibration.fit_residual_error),
        parameter_stability_delta=float(calibration.parameter_stability_delta) if calibration.parameter_stability_delta is not None else None,
        validation_status=calibration.validation_status,
        validation_notes=calibration.validation_notes
    )
    
    return CurveResponse(
        curve_date=calibration.curve_date,
        model_type=calibration.model_type,
        parameters=parameters,
        spline_knots=calibration.spline_knots,
        diagnostics=diagnostics
    )
