from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required.")

if DATABASE_URL.startswith("sqlite:///"):
    sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
    if sqlite_path and sqlite_path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(sqlite_path)), exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    from models.event import Event
    from models.match import Match
    from models.prediction import ModelArtifact, Prediction

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_is_available() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def upsert_match_record(
    db: Session,
    *,
    fixture_id: int,
    league_id: int,
    season: int | None,
    referee_name: str | None,
    kickoff_at: datetime | None,
    status: str,
    is_completed: bool,
    home_team_id: int,
    home_team_name: str,
    away_team_id: int,
    away_team_name: str,
    home_goals: int | None,
    away_goals: int | None,
    venue_name: str | None,
    raw_payload: dict | None,
):
    from models.match import Match

    match = db.execute(select(Match).where(Match.fixture_id == fixture_id)).scalar_one_or_none()
    payload = {
        "league_id": league_id,
        "season": season,
        "referee_name": referee_name,
        "kickoff_at": kickoff_at,
        "status": status,
        "is_completed": is_completed,
        "home_team_id": home_team_id,
        "home_team_name": home_team_name,
        "away_team_id": away_team_id,
        "away_team_name": away_team_name,
        "home_goals": home_goals,
        "away_goals": away_goals,
        "venue_name": venue_name,
        "raw_payload": raw_payload,
        "updated_at": datetime.utcnow(),
    }

    if match is None:
        match = Match(fixture_id=fixture_id, **payload)
        db.add(match)
    else:
        for key, value in payload.items():
            setattr(match, key, value)

    db.flush()
    return match


def save_prediction_record(
    db: Session,
    *,
    fixture_id: int,
    predicted_home_goals: float,
    predicted_away_goals: float,
    home_win_probability: float,
    draw_probability: float,
    away_win_probability: float,
    confidence: str,
    key_player_availability_score: float | None,
    generated_at: datetime,
    valid_until: datetime | None,
    model_version: str | None,
    feature_payload: dict | None,
    raw_output: dict | None,
):
    from models.prediction import Prediction

    prediction = Prediction(
        fixture_id=fixture_id,
        predicted_home_goals=predicted_home_goals,
        predicted_away_goals=predicted_away_goals,
        home_win_probability=home_win_probability,
        draw_probability=draw_probability,
        away_win_probability=away_win_probability,
        confidence=confidence,
        key_player_availability_score=key_player_availability_score,
        generated_at=generated_at,
        valid_until=valid_until,
        model_version=model_version,
        feature_payload=feature_payload,
        raw_output=raw_output,
    )
    db.add(prediction)
    db.flush()
    return prediction


def get_latest_prediction(db: Session, fixture_id: int):
    from models.prediction import Prediction

    return db.execute(
        select(Prediction)
        .where(Prediction.fixture_id == fixture_id)
        .order_by(Prediction.generated_at.desc())
    ).scalars().first()


def save_model_artifact(
    db: Session,
    *,
    league_id: int,
    season_range: str,
    model_name: str,
    version: str,
    metrics: dict | None,
    artifact_path: str | None,
    artifact_blob: str | None,
):
    from models.prediction import ModelArtifact

    artifact = ModelArtifact(
        league_id=league_id,
        season_range=season_range,
        model_name=model_name,
        version=version,
        metrics=metrics,
        artifact_path=artifact_path,
        artifact_blob=artifact_blob,
    )
    db.add(artifact)
    db.flush()
    return artifact


def get_latest_model_artifact(db: Session, league_id: int):
    from models.prediction import ModelArtifact

    return db.execute(
        select(ModelArtifact)
        .where(ModelArtifact.league_id == league_id)
        .order_by(ModelArtifact.created_at.desc())
    ).scalars().first()
