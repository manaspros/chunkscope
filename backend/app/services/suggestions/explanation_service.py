"""
Explanation Service
Uses LLM to generate human-readable explanations of RAG configuration recommendations.
"""
from app.core.logging import get_logger
from app.services.llm_service import llm_service
from app.services.suggestions.document_profiler import DocumentProfile
from app.services.suggestions.strategy_recommender import Recommendation

logger = get_logger(__name__)

SYSTEM_PROMPT = (
    "You are an expert in Retrieval-Augmented Generation (RAG) pipeline design. "
    "Explain RAG configuration choices in plain, accessible language for a user "
    "who may not be deeply technical. Be concise: 3-5 sentences."
)

EXPLANATION_TEMPLATE = """Given the following document profile and recommended RAG configuration, explain in 3-5 sentences why these settings are a good fit.

Document Profile:
- Type: {doc_type}
- Words: {total_words:,}
- Sentences: {total_sentences:,}
- Paragraphs: {total_paragraphs:,}
- Avg sentence length: {avg_sentence_length:.1f} words
- Vocabulary diversity: {vocabulary_diversity:.2%}
- Language complexity: {language_complexity}
- Headings: {heading_count}, Tables: {table_count}, Code blocks: {code_block_count}
- Complex structure: {has_complex_structure}
- Content density: {content_density:.0f} chars/paragraph
- Repetition score: {repetition_score:.2%}
- Top topics: {top_topics}

Recommended Configuration:
- Chunking method: {chunking_method}
- Chunk size: {chunk_size} tokens
- Chunk overlap: {chunk_overlap} tokens
- Embedding model: {embedding_model}
- Retrieval strategy: {retrieval_strategy}
- Reranker: {reranker}

Explain why this configuration is recommended for this document. Focus on the practical impact of each choice."""


class ExplanationService:
    """Generates LLM-powered explanations of RAG configuration recommendations."""

    async def explain(
        self,
        profile: DocumentProfile,
        recommendation: Recommendation,
        model: str = "gpt-4o-mini",
    ) -> str:
        """
        Generate a 3-5 sentence explanation of why these settings are recommended.

        Args:
            profile: The document profile.
            recommendation: The recommended configuration.
            model: LLM model to use for explanation generation.

        Returns:
            A human-readable explanation string.
        """
        prompt = EXPLANATION_TEMPLATE.format(
            doc_type=profile.doc_type,
            total_words=profile.total_words,
            total_sentences=profile.total_sentences,
            total_paragraphs=profile.total_paragraphs,
            avg_sentence_length=profile.avg_sentence_length,
            vocabulary_diversity=profile.vocabulary_diversity,
            language_complexity=profile.language_complexity,
            heading_count=profile.heading_count,
            table_count=profile.table_count,
            code_block_count=profile.code_block_count,
            has_complex_structure=profile.has_complex_structure,
            content_density=profile.content_density,
            repetition_score=profile.repetition_score,
            top_topics=", ".join(profile.top_topics) if profile.top_topics else "N/A",
            chunking_method=recommendation.chunking_method,
            chunk_size=recommendation.chunk_size,
            chunk_overlap=recommendation.chunk_overlap,
            embedding_model=recommendation.embedding_model,
            retrieval_strategy=recommendation.retrieval_strategy,
            reranker=recommendation.reranker or "None",
        )

        try:
            explanation = await llm_service.generate(
                prompt=prompt,
                system_prompt=SYSTEM_PROMPT,
                model=model,
                temperature=0.5,
                max_tokens=512,
            )
            return explanation.strip()
        except Exception as e:
            logger.error("explanation_generation_failed", error=str(e))
            # Fall back to the rule-based reasoning
            return recommendation.reasoning


# Singleton
explanation_service = ExplanationService()
