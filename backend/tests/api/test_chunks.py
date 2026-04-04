"""
Chunk Endpoints Integration Tests
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from uuid import uuid4
import os
import shutil
from app.models import Document, Chunk, DocumentType


@pytest_asyncio.fixture
async def test_document_with_text(test_db) -> Document:
    """Create a test document with extracted text."""
    # Ensure uploads directory exists
    os.makedirs("./uploads", exist_ok=True)
    
    # Copy sample PDF
    source_pdf = "backend/tests/fixtures/sample_contract.pdf"
    dest_pdf = "./uploads/test123.pdf"
    
    # Create valid PDF if source doesn't exist (fallback)
    if os.path.exists(source_pdf):
        shutil.copy(source_pdf, dest_pdf)
    else:
        # Initial bytes for a valid minimal PDF
        with open(dest_pdf, "wb") as f:
            f.write(b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 24 Tf\n100 100 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000216 00000 n\n0000000293 00000 n\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n388\n%%EOF")

    doc = Document(
        filename="test123.pdf",
        original_filename="test.pdf",
        file_path=dest_pdf,
        file_type=DocumentType.PDF,
        file_size_bytes=1024,
        extracted_text="This is the first paragraph. It has multiple sentences. Here is another one.\n\nThis is a second paragraph. It also has sentences. The end.",
        is_processed=True,
    )
    test_db.add(doc)
    await test_db.commit()
    await test_db.refresh(doc)
    
    yield doc
    
    # Text cleanup
    if os.path.exists(dest_pdf):
        try:
            os.remove(dest_pdf)
        except:
            pass


@pytest_asyncio.fixture
async def test_document_no_text(test_db) -> Document:
    """Create a test document without extracted text."""
    doc = Document(
        filename="unprocessed.pdf",
        original_filename="unprocessed.pdf",
        file_path="./uploads/unprocessed.pdf",
        file_type=DocumentType.PDF,
        file_size_bytes=512,
        extracted_text=None,
        is_processed=False,
    )
    test_db.add(doc)
    await test_db.commit()
    await test_db.refresh(doc)
    return doc


# ============================================
# Visualize Tests
# ============================================

@pytest.mark.asyncio
async def test_visualize_fixed_chunking(
    client: AsyncClient,
    test_document_with_text: Document,
):
    """Test fixed-size chunking visualization."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_with_text.id),
            "chunking_config": {
                "method": "fixed",
                "chunk_size": 50,
                "overlap": 10,
            },
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "chunks" in data
    assert "metrics" in data
    assert len(data["chunks"]) > 0
    assert data["metrics"]["total_chunks"] > 0


@pytest.mark.asyncio
async def test_visualize_sentence_chunking(
    client: AsyncClient,
    test_document_with_text: Document,
):
    """Test sentence-based chunking visualization."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_with_text.id),
            "chunking_config": {
                "method": "sentence",
                "chunk_size": 100,
                "overlap": 0,
            },
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["chunks"]) > 0


@pytest.mark.asyncio
async def test_visualize_paragraph_chunking(
    client: AsyncClient,
    test_document_with_text: Document,
):
    """Test paragraph-based chunking visualization."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_with_text.id),
            "chunking_config": {
                "method": "paragraph",
                "chunk_size": 500,
                "overlap": 0,
            },
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["chunks"]) >= 1


@pytest.mark.asyncio
async def test_visualize_recursive_chunking(
    client: AsyncClient,
    test_document_with_text: Document,
):
    """Test recursive chunking visualization."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_with_text.id),
            "chunking_config": {
                "method": "recursive",
                "chunk_size": 60,
                "overlap": 10,
            },
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["chunks"]) > 0


@pytest.mark.asyncio
async def test_visualize_document_not_processed(
    client: AsyncClient,
    test_document_no_text: Document,
):
    """Test error when document has no extracted text."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_no_text.id),
            "chunking_config": {"method": "fixed"},
        },
    )
    
    assert response.status_code == 400
    assert "not been processed" in response.json()["error"]


@pytest.mark.asyncio
async def test_visualize_invalid_overlap(
    client: AsyncClient,
    test_document_with_text: Document,
):
    """Test error when overlap >= chunk_size."""
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(test_document_with_text.id),
            "chunking_config": {
                "method": "fixed",
                "chunk_size": 50,
                "overlap": 60,  # Invalid: overlap > chunk_size
            },
        },
    )
    
    assert response.status_code == 400
    assert "Overlap must be less than" in response.json()["error"]


@pytest.mark.asyncio
async def test_visualize_document_not_found(
    client: AsyncClient,
):
    """Test 404 for non-existent document."""
    fake_id = uuid4()
    response = await client.post(
        "/api/v1/chunks/visualize",
        json={
            "document_id": str(fake_id),
            "chunking_config": {"method": "fixed"},
        },
    )
    
    assert response.status_code == 404
