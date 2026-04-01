"""
Utility to package generated code files into an in-memory ZIP archive.
"""
import io
import zipfile


def build_zip(files: dict[str, str]) -> bytes:
    """
    Take a mapping of ``filename -> content`` and return the bytes of a
    ZIP archive containing those files.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()
