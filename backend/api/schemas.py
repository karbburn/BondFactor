from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
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

# Portfolio schemas
class PortfolioCreate(BaseModel):
    portfolio_name: str = Field(..., min_length=1)

class PortfolioUpdate(BaseModel):
    portfolio_name: str

class PortfolioSummary(BaseModel):
    id: str
    portfolio_name: str
    position_count: int
    created_at: str
    updated_at: str

class PortfolioDetail(BaseModel):
    id: str
    portfolio_name: str
    created_at: str
    updated_at: str
    positions: List["PositionResponse"]

class PositionCreate(BaseModel):
    security_id: str
    face_value_held: float

class PositionResponse(BaseModel):
    id: str
    security_id: str
    isin: str
    security_name: str
    face_value_held: float
    position_type: str
    added_at: str

PortfolioDetail.model_rebuild()

class ArchivedDateItem(BaseModel):
    curve_date: date
    model_type: str
    validation_status: str
    point_count: int

class ZeroCurvePoint(BaseModel):
    tenor_years: float
    zero_rate: float
    discount_factor: float

class ScenarioConfig(BaseModel):
    name: str = "Base Scenario"
    parallel_shift: float = 0.0
    slope_shock: float = 0.0
    curvature1_shock: float = 0.0
    curvature2_shock: float = 0.0
    twist_shock: float = 0.0
    twist_pivot: float = 5.0

class ReportGenerateRequest(BaseModel):
    portfolio_id: str
    format: Literal["pdf", "xlsx"]
    scenarios: List[ScenarioConfig]

class ReportResponse(BaseModel):
    report_id: str
    status: str
    download_url: Optional[str] = None
    error_message: Optional[str] = None

class SavedScenarioCreate(BaseModel):
    scenario_name: str
    parallel_shift: float = 0.0
    slope_shock: float = 0.0
    curvature1_shock: float = 0.0
    curvature2_shock: float = 0.0
    twist_shock: float = 0.0
    twist_pivot: float = 5.0

class SavedScenarioResponse(BaseModel):
    id: str
    scenario_name: str
    parallel_shift: float
    slope_shock: float
    curvature1_shock: float
    curvature2_shock: float
    twist_shock: float
    twist_pivot: float
    created_at: str

class HistoricalCalibrationResponse(BaseModel):
    parallel_shift: float
    slope_shock: float
    curvature1_shock: float
    curvature2_shock: float
    data_points: int
    confidence_level: str
    earliest_date: Optional[str] = None
    latest_date: Optional[str] = None

