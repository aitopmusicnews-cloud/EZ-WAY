from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ddb_safe(value: Any) -> Any:
    return json.loads(json.dumps(value), parse_float=Decimal)


class AwsStateStore:
    def __init__(
        self,
        *,
        jobs_table: Any | None = None,
        track_analysis_table: Any | None = None,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], str] | None = None,
        aws_region: str | None = None,
    ) -> None:
        self._id_factory = id_factory or (lambda: str(uuid.uuid4()))
        self._clock = clock or _now_iso

        if jobs_table is None or track_analysis_table is None:
            import boto3

            jobs_table_name = str(os.getenv("JOBS_TABLE") or "").strip()
            analysis_table_name = str(os.getenv("TRACK_ANALYSIS_TABLE") or "").strip()
            if not jobs_table_name or not analysis_table_name:
                raise RuntimeError("JOBS_TABLE and TRACK_ANALYSIS_TABLE are required on Render.")

            region = str(
                aws_region
                or os.getenv("AWS_REGION")
                or os.getenv("AWS_DEFAULT_REGION")
                or "us-west-2"
            ).strip()
            dynamodb = boto3.resource("dynamodb", region_name=region)
            jobs_table = jobs_table or dynamodb.Table(jobs_table_name)
            track_analysis_table = track_analysis_table or dynamodb.Table(analysis_table_name)

        self.jobs_table = jobs_table
        self.track_analysis_table = track_analysis_table

    def create_job(self, request: dict[str, Any]) -> dict[str, Any]:
        call_id = str(self._id_factory())
        now = self._clock()
        item = {
            "call_id": call_id,
            "job_id": call_id,
            "status": "accepted",
            **request,
            "created_at": now,
            "updated_at": now,
        }
        self.jobs_table.put_item(Item=_ddb_safe(item))
        return item

    def get_job(self, call_id: str) -> dict[str, Any] | None:
        result = self.jobs_table.get_item(
            Key={"call_id": str(call_id)},
            ConsistentRead=True,
        )
        return result.get("Item") or None

    def update_job(self, call_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = self.get_job(call_id)
        if not item:
            raise KeyError(f"Audio Tools job not found: {call_id}")
        item.update(updates)
        item["call_id"] = str(call_id)
        item["updated_at"] = self._clock()
        self.jobs_table.put_item(Item=_ddb_safe(item))
        return item

    def save_track_analysis(self, record: dict[str, Any]) -> None:
        self.track_analysis_table.put_item(Item=_ddb_safe(record))

    def get_track_analysis(self, track_id: str) -> dict[str, Any] | None:
        result = self.track_analysis_table.get_item(
            Key={"track_id": str(track_id)},
            ConsistentRead=True,
        )
        return result.get("Item") or None
