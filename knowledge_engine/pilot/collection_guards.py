"""
Fail-closed guards for protected Chroma collections.

Protected collections must never be deleted, reset, upserted into, or overwritten
by test/pilot tooling. Any write/delete attempt raises ProtectedCollectionError.
"""

from __future__ import annotations

from pathlib import Path

from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_COLLECTION_NAME,
)

# Disposable scratch names for local experiments (never protected).
SCRATCH_VECTOR_TEST_COLLECTION = "bis_vector_test_scratch_tmp"
SCRATCH_MULTILINGUAL_TEST_COLLECTION = "bis_multilingual_test_scratch_tmp"


class ProtectedCollectionError(RuntimeError):
    """Raised when code attempts to mutate a protected collection."""


def is_protected_collection(name: str | None) -> bool:
    return bool(name) and name in PROTECTED_COLLECTIONS


def assert_collection_writable(name: str | None, *, operation: str = "write") -> None:
    if not name:
        raise ProtectedCollectionError(f"Refusing {operation}: empty collection name")
    if is_protected_collection(name):
        raise ProtectedCollectionError(
            f"Refusing {operation} on protected collection {name!r}. "
            f"Protected: {', '.join(sorted(PROTECTED_COLLECTIONS))}"
        )


def assert_collection_deletable(name: str | None) -> None:
    assert_collection_writable(name, operation="delete")


def assert_path_not_protected(path: Path | str, *, operation: str = "write") -> None:
    """Refuse writes under sample_collections/<protected>/ …"""
    s = str(path).replace("\\", "/")
    for name in PROTECTED_COLLECTIONS:
        marker = f"/sample_collections/{name}"
        if marker in s or s.endswith(f"sample_collections/{name}"):
            # Allow reading; only block when the path IS the protected collection root/children
            # and operation is mutating. Callers use this before mkdir/delete/upsert dirs.
            raise ProtectedCollectionError(
                f"Refusing {operation} under protected collection path {name!r}: {path}"
            )


def assert_second_pilot_target(name: str | None) -> None:
    if name != SECOND_PILOT_COLLECTION_NAME:
        raise ProtectedCollectionError(
            f"Second-pilot indexing may only target {SECOND_PILOT_COLLECTION_NAME!r}, "
            f"got {name!r}. Protected/untouchable include {PILOT_COLLECTION_NAME!r}."
        )


def safe_delete_collection(client: object, name: str) -> None:
    """Delete only after fail-closed protected check."""
    assert_collection_deletable(name)
    delete = getattr(client, "delete_collection", None)
    if delete is None:
        raise RuntimeError("client has no delete_collection")
    delete(name)
