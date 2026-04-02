"""
ZIP Archive Processor
Extract and process ZIP archives containing documents.
"""
import os
import tempfile
import uuid
import zipfile
from pathlib import Path


class ZipProcessor:
    """Extract and process ZIP archives containing documents."""

    SKIP_PATTERNS = [
        "__MACOSX",
        ".DS_Store",
        "Thumbs.db",
        ".git",
        "node_modules",
        "__pycache__",
        ".pyc",
    ]

    def extract(self, zip_path: str, max_files: int = 100) -> list[dict]:
        """
        Extract a ZIP file and return list of extracted files.

        Returns:
            [{"filename": "doc.pdf", "path": "/tmp/xxx/doc.pdf",
              "extension": ".pdf", "size": 1234}]
        """
        results = []
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(zip_path, "r") as zf:
                # Security: check for zip bombs
                total_size = sum(info.file_size for info in zf.infolist())
                if total_size > 500 * 1024 * 1024:  # 500MB limit
                    raise ValueError("ZIP archive too large (>500MB uncompressed)")

                for info in zf.infolist():
                    if info.is_dir():
                        continue

                    if any(pattern in info.filename for pattern in self.SKIP_PATTERNS):
                        continue

                    basename = os.path.basename(info.filename)
                    if basename.startswith("."):
                        continue

                    extracted_path = zf.extract(info, tmpdir)
                    ext = Path(info.filename).suffix.lower()

                    results.append(
                        {
                            "filename": basename,
                            "original_path": info.filename,
                            "extracted_path": extracted_path,
                            "extension": ext,
                            "size": info.file_size,
                        }
                    )

                    if len(results) >= max_files:
                        break

        return results

    def extract_to_dir(
        self, zip_path: str, target_dir: str, max_files: int = 100
    ) -> list[dict]:
        """Extract ZIP to a persistent directory (for saving uploaded files)."""
        results = []
        os.makedirs(target_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as zf:
            total_size = sum(info.file_size for info in zf.infolist())
            if total_size > 500 * 1024 * 1024:
                raise ValueError("ZIP archive too large (>500MB uncompressed)")

            for info in zf.infolist():
                if info.is_dir():
                    continue
                if any(pattern in info.filename for pattern in self.SKIP_PATTERNS):
                    continue
                basename = os.path.basename(info.filename)
                if basename.startswith("."):
                    continue

                # Save with flat name to avoid path traversal
                ext = Path(info.filename).suffix.lower()
                safe_name = f"{uuid.uuid4().hex}{ext}"
                target_path = os.path.join(target_dir, safe_name)

                # Extract to memory then write (avoids path traversal)
                with zf.open(info) as src, open(target_path, "wb") as dst:
                    dst.write(src.read())

                results.append(
                    {
                        "filename": basename,
                        "original_path": info.filename,
                        "saved_path": target_path,
                        "safe_name": safe_name,
                        "extension": ext,
                        "size": info.file_size,
                    }
                )

                if len(results) >= max_files:
                    break

        return results


# Singleton instance
zip_processor = ZipProcessor()
