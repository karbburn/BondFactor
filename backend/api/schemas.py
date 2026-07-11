from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import date

class NSSParametersSchema(BaseModel):
    beta0: float
    beta1: float
    beta2: float
    beta3: float
    tau1: float
    tau2: float

class CurveDiagnostics(BaseModel):
    optimizer_converged: bool
    fit_residual_error: float
    parameter_stability_delta: Optional[float] = None
    validation_status: str
    validation_notes: Optional[str] = None

class CurveResponse(BaseModel):
    curve_date: date
    model_type: str
    parameters: Optional[NSSParametersSchema] = None
    spline_knots: Optional[Any] = None
    diagnostics: CurveDiagnostics

class CurveSummary(BaseModel):
    curve_date: date
    model_type: str
    validation_status: str

class TenorItem(BaseModel):
    label: str
    years: float

class KeyRateTenorResponse(BaseModel):
    effective_date: date
    tenors: List[TenorItem]

class SecurityResponse(BaseModel):
    id: str
    isin: str
    security_name: str
    issue_date: date
    maturity_date: date
    coupon_rate: float
    coupon_frequency: int
    face_value: float
    benchmark_tenor_classification: Optional[str] = None
    is_active: bool
