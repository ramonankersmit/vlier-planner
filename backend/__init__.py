"""Backend package initialization."""

# The backend package previously relied on implicit namespace packages, which
# caused ``uvicorn`` to fail when importing ``backend.main`` from certain
# distribution formats (e.g. frozen executables).  Providing an explicit
# ``__init__`` module ensures the package can always be discovered.

