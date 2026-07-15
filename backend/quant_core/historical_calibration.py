import numpy as np

def calibrate_factor_shocks_from_history(calibrations: list) -> dict:
    """
    Given a list of CurveCalibration objects sorted by curve_date,
    calculates the 95th percentile of the absolute daily moves for beta0, beta1, beta2, beta3.
    Only NSS calibrations are included; spline calibrations are skipped.
    """
    def _is_spline(c):
        if hasattr(c, "model_type"):
            return c.model_type == "cubic_spline"
        if isinstance(c, dict):
            return c.get("model_type") == "cubic_spline"
        return False

    nss_calibrations = [c for c in calibrations if not _is_spline(c)]
    T = len(nss_calibrations)
    if T <= 1:
        return {
            "parallel_shift": 0.0,
            "slope_shock": 0.0,
            "curvature1_shock": 0.0,
            "curvature2_shock": 0.0,
            "data_points": T,
            "confidence_level": "insufficient_data",
            "earliest_date": None,
            "latest_date": None
        }

    beta0_series = []
    beta1_series = []
    beta2_series = []
    beta3_series = []

    for c in nss_calibrations:
        if hasattr(c, "beta0"):
            b0 = float(c.beta0) if c.beta0 is not None else 0.0
            b1 = float(c.beta1) if c.beta1 is not None else 0.0
            b2 = float(c.beta2) if c.beta2 is not None else 0.0
            b3 = float(c.beta3) if c.beta3 is not None else 0.0
        else:
            b0 = float(c.get("beta0", 0.0))
            b1 = float(c.get("beta1", 0.0))
            b2 = float(c.get("beta2", 0.0))
            b3 = float(c.get("beta3", 0.0))

        beta0_series.append(b0)
        beta1_series.append(b1)
        beta2_series.append(b2)
        beta3_series.append(b3)

    d0 = np.abs(np.diff(beta0_series))
    d1 = np.abs(np.diff(beta1_series))
    d2 = np.abs(np.diff(beta2_series))
    d3 = np.abs(np.diff(beta3_series))

    parallel_shift = float(np.percentile(d0, 95))
    slope_shock = float(np.percentile(d1, 95))
    curvature1_shock = float(np.percentile(d2, 95))
    curvature2_shock = float(np.percentile(d3, 95))

    if hasattr(nss_calibrations[0], "curve_date"):
        earliest_date = nss_calibrations[0].curve_date.strftime("%Y-%m-%d")
        latest_date = nss_calibrations[-1].curve_date.strftime("%Y-%m-%d")
    else:
        earliest_date = str(nss_calibrations[0].get("curve_date"))
        latest_date = str(nss_calibrations[-1].get("curve_date"))

    if T < 30:
        confidence = "very_low"
    elif T < 90:
        confidence = "low"
    elif T < 365:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "parallel_shift": parallel_shift,
        "slope_shock": slope_shock,
        "curvature1_shock": curvature1_shock,
        "curvature2_shock": curvature2_shock,
        "data_points": T,
        "confidence_level": confidence,
        "earliest_date": earliest_date,
        "latest_date": latest_date
    }
