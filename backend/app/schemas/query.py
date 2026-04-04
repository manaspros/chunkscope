from uuid import UUID
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from app.schemas.document import ChunkResponse

class QueryRequest(BaseModel):
    """Request schema for retrieval queries."""
    query: str = Field(..., description="Query text to search for")
    retrieval_method: str = Field(
        default="vector", 
        description="Retrieval algorithm: vector | keyword | hybrid | mmr | parent_document"
    )
    top_k: int = Field(default=5, ge=1, le=100)
    project_id: Optional[UUID] = Field(default=None, description="Filter results by project ID")
    document_id: Optional[UUID] = Field(default=None, description="Filter results by document ID")
    
    # Hybrid search params
    alpha: float = Field(default=0.7, ge=0.0, le=1.0, description="Weight for vector vs keyword search (1.0 = pure vector)")
    
    # MMR search params
    lambda_mult: float = Field(default=0.5, ge=0.0, le=1.0, description="Diversity vs relevance for MMR")
    fetch_k: int = Field(default=20, ge=1, le=200, description="Number of candidates to fetch before reranking/MMR")
    # Augmentation params
    augmentation_method: Optional[str] = Field(
        default=None, 
        description="Query augmentation strategy: multi_query | hyde | expansion"
    )
    num_variants: int = Field(default=3, ge=1, le=5, description="Number of variants for multi_query")

class ChunkWithScore(ChunkResponse):
    """Chunk response with similarity score."""
    score: float
    metadata: Optional[dict] = None

class QueryResponse(BaseModel):
    """Response schema for retrieval queries."""
    query: str
    results: List[ChunkWithScore]
    retrieval_method: str
    total_results: int
