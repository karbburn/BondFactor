from sqlalchemy import Column, String, Date, Numeric, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
import uuid

Base = declarative_base()

class RawParYieldObservation(Base):
    __tablename__ = "raw_par_yield_observations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    observation_date = Column(Date, nullable=False)
    source = Column(String, nullable=False)
    tenor_label = Column(String, nullable=True)   # Nullable for failed fetches
    tenor_years = Column(Numeric, nullable=True)   # Nullable for failed fetches
    par_yield = Column(Numeric, nullable=True)     # Nullable for failed fetches
    fetch_status = Column(String, nullable=False)  # 'success', 'failed', 'manual_override'
    fetched_at = Column(DateTime(timezone=True), nullable=False)
    raw_payload = Column(JSON, nullable=True)       # Stores error info or raw response payload

class CurveCalibration(Base):
    __tablename__ = "curve_calibrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    curve_date = Column(Date, nullable=False, index=True)
    model_type = Column(String, nullable=False)   # 'nss' | 'cubic_spline'
    is_active = Column(Boolean, nullable=False, default=True)
    
    # NSS parameters
    beta0 = Column(Numeric, nullable=True)
    beta1 = Column(Numeric, nullable=True)
    beta2 = Column(Numeric, nullable=True)
    beta3 = Column(Numeric, nullable=True)
    tau1 = Column(Numeric, nullable=True)
    tau2 = Column(Numeric, nullable=True)
    
    # Cubic spline parameters
    spline_knots = Column(JSON, nullable=True)
    
    optimizer_converged = Column(Boolean, nullable=False)
    fit_residual_error = Column(Numeric, nullable=False)
    parameter_stability_delta = Column(Numeric, nullable=True)
    validation_status = Column(String, nullable=False)  # 'passed' | 'failed_fallback_used'
    validation_notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)

class ReferenceZeroCurve(Base):
    __tablename__ = "reference_zero_curves"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    curve_date = Column(Date, nullable=False, index=True)
    calibration_id = Column(String(36), ForeignKey("curve_calibrations.id"), nullable=False)
    tenor_years = Column(Numeric, nullable=False)
    discount_factor = Column(Numeric, nullable=False)
    zero_rate = Column(Numeric, nullable=False)

class KeyRateTenorGrid(Base):
    __tablename__ = "key_rate_tenor_grid"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    effective_date = Column(Date, nullable=False)
    tenor_label = Column(String, nullable=False)
    tenor_years = Column(Numeric, nullable=False)
    source = Column(String, nullable=False)

class Security(Base):
    __tablename__ = "securities"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    isin = Column(String, unique=True, nullable=False, index=True)
    security_name = Column(String, nullable=False)
    issue_date = Column(Date, nullable=False)
    maturity_date = Column(Date, nullable=False, index=True)
    coupon_rate = Column(Numeric, nullable=False)
    coupon_frequency = Column(Numeric, nullable=False, default=2)
    face_value = Column(Numeric, nullable=False, default=100.0)
    benchmark_tenor_classification = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, index=True)
    portfolio_name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_id = Column(String(36), ForeignKey("portfolios.id"), nullable=False, index=True)
    security_id = Column(String(36), ForeignKey("securities.id"), nullable=False)
    face_value_held = Column(Numeric, nullable=False)
    position_type = Column(String, nullable=False, default="long")
    added_at = Column(DateTime(timezone=True), nullable=False)

class ReportGeneration(Base):
    __tablename__ = "report_generations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, index=True)
    portfolio_id = Column(String(36), ForeignKey("portfolios.id"), nullable=False)
    format = Column(String, nullable=False)  # 'pdf' | 'xlsx'
    scenario_config = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="processing")  # 'processing' | 'completed' | 'failed'
    storage_path = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
