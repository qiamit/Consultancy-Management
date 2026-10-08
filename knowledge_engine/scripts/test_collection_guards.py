#!/usr/bin/env python3
"""Mock tests: protected collections refuse delete/write (no Chroma / PDF)."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.collection_guards import (
    ProtectedCollectionError,
    SCRATCH_VECTOR_TEST_COLLECTION,
    assert_collection_deletable,
    assert_collection_writable,
    assert_path_not_protected,
    assert_second_pilot_target,
    is_protected_collection,
    safe_delete_collection,
)
from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_COLLECTION_NAME,
)


class _FakeClient:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete_collection(self, name: str) -> None:
        self.deleted.append(name)


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        checks.append((name, cond, detail))

    for name in sorted(PROTECTED_COLLECTIONS):
        check(f"protected:{name}", is_protected_collection(name))
        try:
            assert_collection_deletable(name)
            check(f"delete_blocked:{name}", False, "should have raised")
        except ProtectedCollectionError:
            check(f"delete_blocked:{name}", True)
        try:
            assert_collection_writable(name, operation="upsert")
            check(f"write_blocked:{name}", False, "should have raised")
        except ProtectedCollectionError:
            check(f"write_blocked:{name}", True)

    check("scratch_writable", not is_protected_collection(SCRATCH_VECTOR_TEST_COLLECTION))
    assert_collection_writable(SCRATCH_VECTOR_TEST_COLLECTION)
    check("scratch_ok", True)

    client = _FakeClient()
    try:
        safe_delete_collection(client, PILOT_COLLECTION_NAME)
        check("safe_delete_v1", False, "should raise")
    except ProtectedCollectionError:
        check("safe_delete_v1", True)
    check("safe_delete_no_side_effect", client.deleted == [])

    safe_delete_collection(client, SCRATCH_VECTOR_TEST_COLLECTION)
    check("safe_delete_scratch", client.deleted == [SCRATCH_VECTOR_TEST_COLLECTION])

    try:
        assert_path_not_protected(
            Path("/tmp/sample_collections/bis_pilot_representative_v1/chroma"),
            operation="mkdir",
        )
        check("path_v1_blocked", False)
    except ProtectedCollectionError:
        check("path_v1_blocked", True)

    try:
        assert_second_pilot_target(PILOT_COLLECTION_NAME)
        check("v2_target_v1_blocked", False)
    except ProtectedCollectionError:
        check("v2_target_v1_blocked", True)
    assert_second_pilot_target(SECOND_PILOT_COLLECTION_NAME)
    check("v2_target_ok", True)

    # try_chromadb_index must refuse protected name without calling Chroma
    from knowledge_engine.local_vector_test import try_chromadb_index

    try:
        try_chromadb_index(
            persist_dir=Path("/tmp/should_not_matter"),
            chunks=[],
            collection_name=PILOT_COLLECTION_NAME,
        )
        check("try_chroma_protected", False)
    except RuntimeError as exc:
        check("try_chroma_protected", "protected" in str(exc).lower() or "Refusing" in str(exc))

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
