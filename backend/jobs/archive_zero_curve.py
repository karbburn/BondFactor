import logging
import numpy as np
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.models import RawParYieldObservation, CurveCalibration, ReferenceZeroCurve
from quant_core.nss import calibrate_nss
from quant_core.calibration_validation import validate_calibration
from quant_core.bootstrap import bootstrap_zero_curve

logger = logging.getLogger("archive_zero_curve")


def archive_zero_curve(db: Session, curve_date) -> bool:
    """
    Reads raw observations for curve_date, calibrates NSS, validates,
    bootstraps zero curve, and saves to curve_calibrations + reference_zero_curves.
    Returns True on success, False on failure.
    """
    rows = (
        db.query(RawParYieldObservation)
        .filter(
            RawParYieldObservation.observation_date == curve_date,
            RawParYieldObservation.fetch_status.in_(["success", "manual_override"]),
            RawParYieldObservation.tenor_years.isnot(None),
            RawParYieldObservation.par_yield.isnot(None),
        )
        .order_by(RawParYieldObservation.tenor_years.asc())
        .all()
    )

    if len(rows) < 3:
        logger.warning(f"Skipping archive for {curve_date}: only {len(rows)} valid observations (need >= 3)")
        return False

    tenors = np.array([float(r.tenor_years) for r in rows])
    yields = np.array([float(r.par_yield) for r in rows])

    # Calibrate NSS
    opt_result = calibrate_nss(tenors, yields)
    params = [opt_result["beta0"], opt_result["beta1"], opt_result["beta2"],
              opt_result["beta3"], opt_result["tau1"], opt_result["tau2"]]

    # Validate
    validation = validate_calibration(opt_result, params, tenors, yields)
    model_type = "nss"
    if validation.fallback_used:
        model_type = "cubic_spline"

    # Build par curve function for bootstrapping
    if model_type == "nss":
        from quant_core.nss import nss_yield
        par_curve_fn = lambda t: nss_yield(t, *params)
    else:
        from quant_core.spline import CubicSplineCurve
        spline = CubicSplineCurve(tenors, yields)
        par_curve_fn = spline.evaluate

    # Bootstrap zero curve
    zc = bootstrap_zero_curve(par_curve_fn, 40.0, 0.5)

    # Check if already archived for this date
    existing = db.query(CurveCalibration).filter(
        CurveCalibration.curve_date == curve_date,
        CurveCalibration.is_active == True,
    ).first()

    now = datetime.now(timezone.utc)

    if existing:
        # Update existing calibration
        cal = existing
        cal.model_type = model_type
        cal.optimizer_converged = opt_result.get("success", False)
        cal.fit_residual_error = validation.rmse
        cal.validation_status = "passed" if validation.passed else "failed_fallback_used"
        cal.validation_notes = "; ".join(validation.reasons) if validation.reasons else None
        if model_type == "nss":
            cal.beta0 = params[0]
            cal.beta1 = params[1]
            cal.beta2 = params[2]
            cal.beta3 = params[3]
            cal.tau1 = params[4]
            cal.tau2 = params[5]
        # Delete old zero curve points
        db.query(ReferenceZeroCurve).filter(ReferenceZeroCurve.calibration_id == cal.id).delete()
    else:
        cal = CurveCalibration(
            curve_date=curve_date,
            model_type=model_type,
            is_active=True,
            beta0=params[0] if model_type == "nss" else None,
            beta1=params[1] if model_type == "nss" else None,
            beta2=params[2] if model_type == "nss" else None,
            beta3=params[3] if model_type == "nss" else None,
            tau1=params[4] if model_type == "nss" else None,
            tau2=params[5] if model_type == "nss" else None,
            optimizer_converged=opt_result.get("success", False),
            fit_residual_error=validation.rmse,
            parameter_stability_delta=None,
            validation_status="passed" if validation.passed else "failed_fallback_used",
            validation_notes="; ".join(validation.reasons) if validation.reasons else None,
            created_at=now,
        )
        db.add(cal)
        db.flush()

    # Insert zero curve points
    for t, zr in zip(zc.maturities, zc.zero_rates):
        db.add(ReferenceZeroCurve(
            curve_date=curve_date,
            calibration_id=cal.id,
            tenor_years=float(t),
            discount_factor=float(zc.get_discount_factor(t)),
            zero_rate=float(zr),
        ))

    db.commit()
    logger.info(f"Archived zero curve for {curve_date}: {len(zc.maturities)} points, model={model_type}")
    return True
