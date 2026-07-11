from datetime import datetime, timezone
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.dependencies import get_current_user
from api.schemas import SavedScenarioCreate, SavedScenarioResponse
from db.session import get_db
from db.models import SavedScenario

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


def _to_response(s: SavedScenario) -> SavedScenarioResponse:
    return SavedScenarioResponse(
        id=s.id,
        scenario_name=s.scenario_name,
        parallel_shift=float(s.parallel_shift),
        slope_shock=float(s.slope_shock),
        curvature1_shock=float(s.curvature1_shock),
        curvature2_shock=float(s.curvature2_shock),
        twist_shock=float(s.twist_shock),
        twist_pivot=float(s.twist_pivot),
        created_at=s.created_at.isoformat(),
    )


@router.get("/saved", response_model=list[SavedScenarioResponse])
def list_saved_scenarios(user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SavedScenario)
        .filter(SavedScenario.user_id == user["id"])
        .order_by(SavedScenario.created_at.desc())
        .all()
    )
    return [_to_response(r) for r in rows]


@router.post("/saved", status_code=201, response_model=SavedScenarioResponse)
def create_saved_scenario(body: SavedScenarioCreate, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    s = SavedScenario(
        user_id=user["id"],
        scenario_name=body.scenario_name,
        parallel_shift=body.parallel_shift,
        slope_shock=body.slope_shock,
        curvature1_shock=body.curvature1_shock,
        curvature2_shock=body.curvature2_shock,
        twist_shock=body.twist_shock,
        twist_pivot=body.twist_pivot,
        created_at=_now(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_response(s)


@router.get("/saved/{scenario_id}", response_model=SavedScenarioResponse)
def get_saved_scenario(scenario_id: str, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(SavedScenario).filter(
        SavedScenario.id == scenario_id, SavedScenario.user_id == user["id"]
    ).first()
    if not s:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Scenario not found."})
    return _to_response(s)


@router.delete("/saved/{scenario_id}", status_code=204)
def delete_saved_scenario(scenario_id: str, user: Dict = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(SavedScenario).filter(
        SavedScenario.id == scenario_id, SavedScenario.user_id == user["id"]
    ).first()
    if not s:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Scenario not found."})
    db.delete(s)
    db.commit()
