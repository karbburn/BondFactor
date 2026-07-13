import logging
import numpy as np
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.models import RawParYieldObservation, CurveCalibration, ReferenceZeroCurve
from quant_core.nss import calibrate_nss
from quant_core.calibration_validation import validate_calibration
from quant_core.bootstrap import bootstrap_zero_curve, build_zero_curve_from_zero_rates

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
            RawParYieldObservation.yield_value.isnot(None),
        )
        .order_by(RawParYieldObservation.tenor_years.asc())
        .all()
    )

    if len(rows) < 3:
        logger.warning(f"Skipping archive for {curve_date}: only {len(rows)} valid observations (need >= 3)")
        return False

    tenors = np.array([float(r.tenor_years) for r in rows])
    yields = np.array([float(r.yield_value) for r in rows])

    source = rows[0].source
    yield_type = "zero_coupon" if source == "nse_zcyc" else "par"

    # ponytail: zero-coupon data skips NSS (designed for par curves), goes straight to spline
    if yield_type == "zero_coupon":
        from quant_core.spline import CubicSplineCurve
        model_type = "cubic_spline"
        curve_fn = CubicSplineCurve(tenors, yields).evaluate
        opt_result = {"success": True, "fun": 0.0, "nfev": 0}
        validation_rmse = 0.0
        validation_passed = True
        validation_reasons = []
        params = [None] * 6
    else:
        opt_result = calibrate_nss(tenors, yields)
        params = [opt_result["beta0"], opt_result["beta1"], opt_result["beta2"],
                  opt_result["beta3"], opt_result["tau1"], opt_result["tau2"]]
        validation = validate_calibration(opt_result, params, tenors, yields)
        model_type = "nss" if not validation.fallback_used else "cubic_spline"
        if model_type == "nss":
            from quant_core.nss import nss_yield
            curve_fn = lambda t: nss_yield(t, *params)
        else:
            from quant_core.spline import CubicSplineCurve
            curve_fn = CubicSplineCurve(tenors, yields).evaluate
        validation_rmse = validation.rmse
        validation_passed = validation.passed
        validation_reasons = validation.reasons or []

    zc = build_zero_curve_from_zero_rates(curve_fn, 40.0, 0.5) if yield_type == "zero_coupon" \
        else bootstrap_zero_curve(curve_fn, 40.0, 0.5)

    # Check if already archived for this date
    existing = db.query(CurveCalibration).filter(
        CurveCalibration.curve_date == curve_date,
        CurveCalibration.is_active == True,
    ).first()

    now = datetime.now(timezone.utc)

    if existing:
        cal = existing
        cal.model_type = model_type
        cal.yield_type = yield_type
        cal.optimizer_converged = opt_result.get("success", False)
        cal.fit_residual_error = validation_rmse
        cal.validation_status = "passed" if validation_passed else "failed_fallback_used"
        cal.validation_notes = "; ".join(validation_reasons) if validation_reasons else None
        if model_type == "nss":
            cal.beta0 = params[0]
            cal.beta1 = params[1]
            cal.beta2 = params[2]
            cal.beta3 = params[3]
            cal.tau1 = params[4]
            cal.tau2 = params[5]
        db.query(ReferenceZeroCurve).filter(ReferenceZeroCurve.calibration_id == cal.id).delete()
    else:
        cal = CurveCalibration(
            curve_date=curve_date,
            model_type=model_type,
            yield_type=yield_type,
            is_active=True,
            beta0=params[0] if model_type == "nss" else None,
            beta1=params[1] if model_type == "nss" else None,
            beta2=params[2] if model_type == "nss" else None,
            beta3=params[3] if model_type == "nss" else None,
            tau1=params[4] if model_type == "nss" else None,
            tau2=params[5] if model_type == "nss" else None,
            optimizer_converged=opt_result.get("success", False),
            fit_residual_error=validation_rmse,
            parameter_stability_delta=None,
            validation_status="passed" if validation_passed else "failed_fallback_used",
            validation_notes="; ".join(validation_reasons) if validation_reasons else None,
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
    logger.info(f"Archived zero curve for {curve_date}: {len(zc.maturities)} points, model={model_type}, yield_type={yield_type}")
    return True
