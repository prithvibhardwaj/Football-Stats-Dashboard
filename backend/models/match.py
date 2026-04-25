from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from services.db import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fixture_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    league_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    season: Mapped[int | None] = mapped_column(Integer, nullable=True)
    referee_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="SCHEDULED", nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    home_team_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    home_team_name: Mapped[str] = mapped_column(String(255), nullable=False)
    away_team_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    away_team_name: Mapped[str] = mapped_column(String(255), nullable=False)
    home_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_xg: Mapped[float | None] = mapped_column(Float, nullable=True)
    away_xg: Mapped[float | None] = mapped_column(Float, nullable=True)
    venue_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    events = relationship(
        "Event",
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    predictions = relationship(
        "Prediction",
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
