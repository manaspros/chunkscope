"""
Tests for the AI Suggestion Engine.
Tests document profiling, strategy recommendation, and that different
document types produce different configurations.
"""
import pytest

from app.services.suggestions import SuggestionService
from app.services.suggestions.document_profiler import DocumentProfile, DocumentProfiler
from app.services.suggestions.strategy_recommender import (
    Recommendation,
    StrategyRecommender,
    SuggestionResult,
)


# ---------------------------------------------------------------------------
# Sample texts
# ---------------------------------------------------------------------------

LEGAL_TEXT = """
CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT

This Confidentiality and Non-Disclosure Agreement ("Agreement") is entered into
as of the date last signed below by and between the parties identified herein.

WHEREAS, the parties wish to explore a potential business relationship and in
connection therewith may disclose to each other certain confidential and
proprietary information;

NOW, THEREFORE, in consideration of the mutual covenants and agreements set
forth herein and for other good and valuable consideration, the receipt and
sufficiency of which are hereby acknowledged, the parties agree as follows:

1. DEFINITIONS

"Confidential Information" shall mean any and all non-public information,
including but not limited to trade secrets, technical data, business plans,
financial information, customer lists, and any other information designated as
confidential by the disclosing party.

2. OBLIGATIONS OF THE RECEIVING PARTY

The Receiving Party agrees to hold the Confidential Information in strict
confidence and not to disclose such information to any third party without the
prior written consent of the Disclosing Party. The Receiving Party shall use
the Confidential Information solely for the purpose of evaluating the potential
business relationship between the parties.

3. TERM AND TERMINATION

This Agreement shall remain in effect for a period of two (2) years from the
date of execution. The obligations of confidentiality shall survive the
termination of this Agreement for an additional period of three (3) years.

4. JURISDICTION

This Agreement shall be governed by and construed in accordance with the laws
of the State of Delaware, without regard to its conflict of laws principles.
Any disputes arising under this Agreement shall be resolved exclusively in the
courts of the State of Delaware.

5. SEVERABILITY

If any provision of this Agreement is found to be invalid or unenforceable,
the remaining provisions shall continue in full force and effect. The invalid
or unenforceable provision shall be modified to the minimum extent necessary
to make it valid and enforceable.

6. INDEMNIFICATION

Each party agrees to indemnify and hold harmless the other party from and
against any and all claims, damages, losses, costs, and expenses (including
reasonable attorneys' fees) arising out of or relating to any breach of this
Agreement by the indemnifying party.
"""

CODE_TEXT = """
# Data Processing Pipeline

## Overview

This module implements the core data processing pipeline for the application.

```python
import pandas as pd
import numpy as np
from typing import List, Dict, Optional

class DataProcessor:
    def __init__(self, config: Dict):
        self.config = config
        self.pipeline = []
        self._initialized = False

    def add_stage(self, stage: callable) -> None:
        self.pipeline.append(stage)

    def process(self, data: pd.DataFrame) -> pd.DataFrame:
        result = data.copy()
        for stage in self.pipeline:
            result = stage(result)
        return result

    def validate(self, data: pd.DataFrame) -> bool:
        required_columns = self.config.get('required_columns', [])
        return all(col in data.columns for col in required_columns)
```

```python
def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=['id', 'timestamp'])
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp')
    return df

def aggregate_metrics(df: pd.DataFrame) -> pd.DataFrame:
    return df.groupby('category').agg({
        'value': ['mean', 'std', 'count'],
        'score': ['min', 'max', 'median']
    })
```

## Configuration

The pipeline accepts the following configuration options:

- `batch_size`: Number of records to process at once (default: 1000)
- `parallel`: Enable parallel processing (default: False)
- `output_format`: Output format, one of 'csv', 'parquet', 'json'

## Error Handling

The pipeline implements retry logic with exponential backoff:

```python
import time
from functools import wraps

def retry(max_attempts=3, backoff_factor=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
                    time.sleep(backoff_factor ** attempt)
        return wrapper
    return decorator
```
"""

GENERAL_TEXT = """
The Rise of Remote Work

Remote work has fundamentally transformed how businesses operate around the
world. What was once considered a perk offered by progressive companies has
become the standard way of working for millions of people globally.

The shift began gradually but accelerated dramatically during recent years.
Companies that had resisted remote work found themselves forced to adapt
practically overnight. Many discovered that their employees were not only
maintaining productivity but actually exceeding previous performance levels.

Communication tools have played a crucial role in enabling this transition.
Video conferencing platforms, project management software, and instant
messaging applications have become essential parts of the modern workplace.
These tools allow teams to collaborate effectively regardless of their
physical locations.

However, remote work is not without its challenges. Many employees report
feeling isolated and disconnected from their colleagues. The boundaries
between work and personal life can become blurred when the office is also
the living room. Managers have had to develop new skills for leading teams
they rarely see in person.

Companies are now experimenting with hybrid models that combine the
flexibility of remote work with the benefits of in-person collaboration.
Some require employees to come into the office two or three days per week,
while others leave it entirely up to individual teams to decide.

The long-term impact of this shift remains to be seen. What is clear is
that the traditional nine-to-five office model is no longer the only viable
option for knowledge workers. The future of work will likely be defined by
flexibility and choice rather than rigid schedules and fixed locations.
"""

ACADEMIC_TEXT = """
Abstract

This paper investigates the impact of transformer-based architectures on
natural language understanding tasks. We present a comprehensive literature
review of attention mechanisms and their applications in modern NLP systems.

1. Introduction

The field of natural language processing has undergone a paradigm shift with
the introduction of transformer models (Vaswani et al., 2017). These models
have achieved state-of-the-art results on a wide range of benchmarks,
including GLUE, SuperGLUE, and SQuAD.

Our hypothesis is that the self-attention mechanism enables more effective
capture of long-range dependencies compared to recurrent architectures.

2. Methodology

We conducted a systematic review of 150 papers published between 2018 and
2024. Our methodology follows the PRISMA guidelines for systematic reviews
and meta-analyses. We evaluated each paper based on the following criteria:
reproducibility, benchmark performance, and computational efficiency.

3. Findings

Our findings indicate that transformer-based models consistently outperform
RNN-based alternatives on tasks requiring long-range context understanding.
The average improvement was 12.3% on reading comprehension tasks and 8.7%
on natural language inference tasks (p < 0.01).

4. Conclusion

The evidence strongly supports our hypothesis. Future work should explore
more efficient attention mechanisms and their applicability to low-resource
languages. The bibliography and supplementary materials are available in
the appendix.

References

Vaswani, A., et al. (2017). Attention is all you need. NeurIPS.
Devlin, J., et al. (2019). BERT: Pre-training of deep bidirectional transformers. NAACL.
"""

FINANCIAL_TEXT = """
ANNUAL FINANCIAL REPORT - FISCAL YEAR 2024

BALANCE SHEET SUMMARY

Total Assets: $4,523,000,000
Total Liabilities: $2,178,000,000
Shareholders' Equity: $2,345,000,000

CASH FLOW STATEMENT

Operating Cash Flow: $892,000,000
Investing Cash Flow: ($456,000,000)
Financing Cash Flow: ($234,000,000)
Net Change in Cash: $202,000,000

REVENUE ANALYSIS

Total Revenue for fiscal year 2024 reached $3.2 billion, representing a
15% increase year-over-year. The growth was driven primarily by expansion
in the cloud services segment, which saw revenue increase by 28%.

EBITDA for the period was $1.1 billion, with an EBITDA margin of 34.4%.
This represents a 200 basis point improvement over the prior fiscal year.

The audit committee has reviewed the financial statements and confirmed
their accuracy. The external auditors provided an unqualified opinion on
all financial statements presented herein.

Operating expenses remained well-controlled, with SG&A expenses as a
percentage of revenue declining from 22% to 19.5%. Research and development
investment increased to $580 million, reflecting our commitment to innovation.
"""


# ---------------------------------------------------------------------------
# Document Profiler Tests
# ---------------------------------------------------------------------------


class TestDocumentProfiler:
    """Tests for the DocumentProfiler."""

    def setup_method(self):
        self.profiler = DocumentProfiler()

    def test_profile_returns_document_profile(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert isinstance(profile, DocumentProfile)

    def test_profile_basic_metrics(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert profile.total_chars > 0
        assert profile.total_words > 0
        assert profile.total_sentences > 0
        assert profile.total_paragraphs > 0
        assert profile.avg_sentence_length > 0
        assert profile.avg_paragraph_length > 0

    def test_profile_vocabulary_diversity(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert 0.0 < profile.vocabulary_diversity <= 1.0

    def test_profile_repetition_score_range(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert 0.0 <= profile.repetition_score <= 1.0

    def test_profile_language_complexity_valid(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert profile.language_complexity in ("simple", "moderate", "complex")

    def test_profile_top_topics_extracted(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert isinstance(profile.top_topics, list)
        assert len(profile.top_topics) > 0
        assert len(profile.top_topics) <= 10

    def test_legal_text_classified_as_legal(self):
        profile = self.profiler.profile(LEGAL_TEXT)
        assert profile.doc_type == "legal"

    def test_code_text_classified_as_code(self):
        profile = self.profiler.profile(CODE_TEXT)
        assert profile.doc_type == "code"

    def test_general_text_classified_as_general(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert profile.doc_type == "general"

    def test_academic_text_classified(self):
        profile = self.profiler.profile(ACADEMIC_TEXT)
        assert profile.doc_type == "academic"

    def test_financial_text_classified_as_financial(self):
        profile = self.profiler.profile(FINANCIAL_TEXT)
        assert profile.doc_type == "financial"

    def test_explicit_doc_type_overrides_classification(self):
        profile = self.profiler.profile(GENERAL_TEXT, doc_type="legal")
        assert profile.doc_type == "legal"

    def test_code_text_has_code_blocks(self):
        profile = self.profiler.profile(CODE_TEXT)
        assert profile.code_block_count > 0

    def test_legal_text_has_headings(self):
        profile = self.profiler.profile(LEGAL_TEXT)
        # Legal text has numbered sections and ALL-CAPS headings
        assert profile.heading_count > 0

    def test_high_repetition_detected(self):
        # Create text with lots of repetition
        repeated = "The quick brown fox jumps over the lazy dog. " * 50
        profile = self.profiler.profile(repeated)
        assert profile.repetition_score > 0.3

    def test_content_density_positive(self):
        profile = self.profiler.profile(GENERAL_TEXT)
        assert profile.content_density > 0


# ---------------------------------------------------------------------------
# Strategy Recommender Tests
# ---------------------------------------------------------------------------


class TestStrategyRecommender:
    """Tests for the StrategyRecommender."""

    def setup_method(self):
        self.profiler = DocumentProfiler()
        self.recommender = StrategyRecommender()

    def _get_result(self, text: str, doc_type: str | None = None) -> SuggestionResult:
        profile = self.profiler.profile(text, doc_type)
        return self.recommender.recommend(profile)

    def test_recommend_returns_suggestion_result(self):
        result = self._get_result(GENERAL_TEXT)
        assert isinstance(result, SuggestionResult)
        assert isinstance(result.primary, Recommendation)
        assert isinstance(result.alternatives, list)
        assert isinstance(result.document_profile, DocumentProfile)

    def test_primary_has_valid_fields(self):
        result = self._get_result(GENERAL_TEXT)
        rec = result.primary
        assert rec.chunking_method != ""
        assert rec.chunk_size > 0
        assert rec.chunk_overlap >= 0
        assert rec.embedding_model != ""
        assert rec.retrieval_strategy != ""
        assert 0.0 <= rec.confidence <= 1.0
        assert rec.reasoning != ""

    def test_two_alternatives_provided(self):
        result = self._get_result(GENERAL_TEXT)
        assert len(result.alternatives) == 2

    def test_alternatives_have_lower_confidence(self):
        result = self._get_result(GENERAL_TEXT)
        for alt in result.alternatives:
            assert alt.confidence <= result.primary.confidence

    def test_legal_gets_semantic_chunking(self):
        result = self._get_result(LEGAL_TEXT)
        assert result.primary.chunking_method == "semantic"

    def test_code_gets_code_aware_chunking(self):
        result = self._get_result(CODE_TEXT)
        # Code text is classified as "code" and should get code-aware chunking
        assert result.primary.chunking_method == "code-aware"

    def test_academic_gets_heading_based_chunking(self):
        result = self._get_result(ACADEMIC_TEXT)
        assert result.primary.chunking_method == "heading-based"

    def test_financial_gets_semantic_chunking(self):
        result = self._get_result(FINANCIAL_TEXT)
        assert result.primary.chunking_method == "semantic"

    def test_general_gets_recursive_chunking(self):
        result = self._get_result(GENERAL_TEXT)
        assert result.primary.chunking_method == "recursive"

    def test_different_doc_types_get_different_configs(self):
        """Verify that different document types produce meaningfully different configs."""
        legal = self._get_result(LEGAL_TEXT)
        code = self._get_result(CODE_TEXT)
        general = self._get_result(GENERAL_TEXT)

        # At minimum, chunking methods should differ
        methods = {
            legal.primary.chunking_method,
            code.primary.chunking_method,
            general.primary.chunking_method,
        }
        assert len(methods) >= 2, "Expected at least 2 different chunking methods"

    def test_hybrid_retrieval_always_recommended(self):
        """All recommendations should include hybrid retrieval."""
        for text in [LEGAL_TEXT, CODE_TEXT, GENERAL_TEXT, ACADEMIC_TEXT, FINANCIAL_TEXT]:
            result = self._get_result(text)
            assert result.primary.retrieval_strategy == "hybrid"

    def test_reranker_recommended(self):
        """Primary recommendations should include a reranker."""
        result = self._get_result(LEGAL_TEXT)
        assert result.primary.reranker is not None

    def test_embedding_model_from_registry(self):
        """Embedding model should come from the registry."""
        from app.services.embedding_registry import EMBEDDING_MODELS

        valid_ids = {m["id"] for m in EMBEDDING_MODELS}
        result = self._get_result(GENERAL_TEXT)
        assert result.primary.embedding_model in valid_ids

    def test_high_repetition_triggers_warning(self):
        """Documents with high repetition should trigger a warning."""
        repeated = "The quick brown fox jumps over the lazy dog. " * 50
        result = self._get_result(repeated)
        has_repetition_warning = any(
            "repetition" in w.lower() for w in result.primary.warnings
        )
        assert has_repetition_warning

    def test_chunk_overlap_less_than_chunk_size(self):
        """Overlap should always be less than chunk size."""
        for text in [LEGAL_TEXT, CODE_TEXT, GENERAL_TEXT, ACADEMIC_TEXT]:
            result = self._get_result(text)
            assert result.primary.chunk_overlap < result.primary.chunk_size


# ---------------------------------------------------------------------------
# SuggestionService Integration Tests
# ---------------------------------------------------------------------------


class TestSuggestionService:
    """Integration tests for the full SuggestionService facade."""

    def setup_method(self):
        self.service = SuggestionService()

    def test_profile_and_recommend_pipeline(self):
        """Test the full profile -> recommend pipeline."""
        profile = self.service.profile(LEGAL_TEXT)
        result = self.service.recommend(profile)

        assert profile.doc_type == "legal"
        assert result.primary.chunking_method == "semantic"
        assert result.document_profile.doc_type == "legal"

    def test_service_singleton_import(self):
        """Test that the suggestion_service singleton can be imported."""
        from app.services.suggestions import suggestion_service

        assert suggestion_service is not None
        profile = suggestion_service.profile(GENERAL_TEXT)
        assert isinstance(profile, DocumentProfile)
