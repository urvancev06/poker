"""Write ``.npz`` files byte for byte reproducibly.

``numpy.savez_compressed`` stamps every member with the current time, so a
rebuild of identical arrays still shows up as a changed binary in git. This
writes the same format (``numpy.load`` reads it) with a fixed member date.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import numpy as np

_EPOCH = (1980, 1, 1, 0, 0, 0)


def write_npz(path: str | Path, **arrays: np.ndarray) -> None:
    """Write ``arrays`` to ``path`` as a deflated npz, members in sorted order."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(arrays):
            buf = io.BytesIO()
            np.lib.format.write_array(buf, np.asanyarray(arrays[name]), allow_pickle=False)
            info = zipfile.ZipInfo(f"{name}.npy", date_time=_EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, buf.getvalue())
