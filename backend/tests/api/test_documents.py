"""
Document Endpoints Integration Tests
"""
import io
import pytest
import pytest_asyncio
from httpx import AsyncClient
from uuid import uuid4

from app.models import Document, DocumentType


@pytest_asyncio.fixture
async def test_document(test_db) -> Document:
    """Create a test document."""
    doc = Document(
        filename="test123.pdf",
        original_filename="test.pdf",
        file_path="./uploads/test123.pdf",
        file_type=DocumentType.PDF,
        file_size_bytes=1024,
        extracted_text="This is sample text for testing. It contains multiple sentences. Here is another one.",
        is_processed=True,
    )
    test_db.add(doc)
    await test_db.commit()
    await test_db.refresh(doc)
    return doc


# ============================================
# Upload Tests
# ============================================

@pytest.mark.asyncio
async def test_upload_pdf_success(client: AsyncClient, tmp_path):
    """Test successful PDF upload."""
    # Create a minimal PDF
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    
    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")},
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "test.pdf"
    assert data["file_type"] == "pdf"
    assert data["is_processed"] is False


@pytest.mark.asyncio
async def test_upload_unknown_file_type_accepted(client: AsyncClient):
    """Test that unknown file types are accepted with type 'unknown'."""
    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.exe", io.BytesIO(b"fake content"), "application/octet-stream")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["file_type"] == "unknown"


@pytest.mark.asyncio
async def test_upload_corrupted_pdf(client: AsyncClient):
    """Test rejection of corrupted PDF (wrong magic bytes)."""
    response = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.pdf", io.BytesIO(b"not a pdf"), "application/pdf")},
    )
    
    assert response.status_code == 400
    assert "not a PDF" in response.json()["error"]


# ============================================
# List/Get/Delete Tests
# ============================================

@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient, test_document: Document):
    """Test listing documents."""
    response = await client.get("/api/v1/documents")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_get_document(client: AsyncClient, test_document: Document):
    """Test getting a specific document."""
    response = await client.get(
        f"/api/v1/documents/{test_document.id}",
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_document.id)
    assert data["original_filename"] == "test.pdf"
    assert data["extracted_text"] == test_document.extracted_text


@pytest.mark.asyncio
async def test_get_document_not_found(client: AsyncClient):
    """Test 404 for non-existent document."""
    fake_id = uuid4()
    response = await client.get(
        f"/api/v1/documents/{fake_id}",
    )
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient, test_document: Document):
    """Test deleting a document."""
    response = await client.delete(
        f"/api/v1/documents/{test_document.id}",
    )
    
    assert response.status_code == 200
    assert response.json()["message"] == "Document deleted successfully"
