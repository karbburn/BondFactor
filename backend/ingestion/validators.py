from typing import Any

class ValidationError(ValueError):
    """Raised when raw observations fail completeness or sanity checks."""
    pass

def validate(batch: Any) -> Any:
    """
    Validates a RawObservationBatch.
    Ensures:
      - The batch contains observations.
      - Every observation has tenor_label, tenor_years, and par_yield.
      - tenor_years is positive.
      - par_yield is within a sane range (0% to 25%).
    Returns the validated batch or raises ValidationError.
    """
    if not batch:
        raise ValidationError("Observation batch is null")
        
    if not getattr(batch, 'observations', None) or len(batch.observations) == 0:
        raise ValidationError("Observation batch does not contain any yield points")
        
    for obs in batch.observations:
        for field in ["tenor_label", "tenor_years", "par_yield"]:
            if field not in obs:
                raise ValidationError(f"Observation point is missing required field: {field}")
                
        try:
            tenor_years = float(obs["tenor_years"])
            par_yield = float(obs["par_yield"])
        except (TypeError, ValueError) as e:
            raise ValidationError(f"Invalid numeric format in observation: {str(e)}")
            
        if tenor_years <= 0:
            raise ValidationError(f"Tenor must be positive. Got: {tenor_years}")
            
        if not (0.0 <= par_yield <= 25.0):
            raise ValidationError(
                f"Par yield {par_yield}% is outside sane G-Sec parameters (0% to 25%)"
            )
            
    return batch
