"""
Decision Engine
Recommends optimal RAG pipeline configurations based on user requirements.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StageRecommendation:
    method: str
    reason: str


@dataclass
class PipelineRecommendationResult:
    chunking: StageRecommendation
    embedding: StageRecommendation
    retrieval: StageRecommendation
    reranking: StageRecommendation
    post_processing: StageRecommendation
    estimated_cost_per_query: str
    estimated_latency: str


class DecisionEngine:
    """Generates pipeline recommendations and exposes decision-tree structures."""

    # -----------------------------------------------------------------
    # recommend_pipeline
    # -----------------------------------------------------------------
    def recommend_pipeline(
        self,
        doc_type: str = "general",
        corpus_size: str = "medium",
        query_type: str = "factoid",
        priority: str = "accuracy",
        has_metadata: bool = False,
        has_gpu: bool = False,
        budget: str = "moderate",
    ) -> dict:
        """Return a recommended pipeline configuration with reasoning.

        Parameters
        ----------
        doc_type : str
            One of: legal, medical, code, academic, financial, general.
        corpus_size : str
            One of: small, medium, large.
        query_type : str
            One of: factoid, analytical, multi-hop, conversational.
        priority : str
            One of: accuracy, speed, cost.
        has_metadata : bool
            Whether documents have rich structured metadata.
        has_gpu : bool
            Whether GPU resources are available.
        budget : str
            One of: free, low, moderate, unlimited.
        """

        # -- Chunking --
        chunking = self._pick_chunking(doc_type, priority, budget)

        # -- Embedding --
        embedding = self._pick_embedding(doc_type, budget, has_gpu)

        # -- Retrieval --
        retrieval = self._pick_retrieval(
            query_type, corpus_size, priority, has_metadata, budget,
        )

        # -- Reranking --
        reranking = self._pick_reranking(priority, budget, has_gpu, corpus_size)

        # -- Post-processing --
        post_processing = StageRecommendation(
            method="lost_in_middle",
            reason="Free accuracy boost for LLM context ordering",
        )

        # -- Estimates --
        cost = self._estimate_cost(chunking, retrieval, reranking, budget)
        latency = self._estimate_latency(retrieval, reranking, priority)

        return {
            "chunking": {"method": chunking.method, "reason": chunking.reason},
            "embedding": {"model": embedding.method, "reason": embedding.reason},
            "retrieval": {"strategy": retrieval.method, "reason": retrieval.reason},
            "reranking": {"strategy": reranking.method, "reason": reranking.reason},
            "post_processing": {
                "strategy": post_processing.method,
                "reason": post_processing.reason,
            },
            "estimated_cost_per_query": cost,
            "estimated_latency": latency,
        }

    # -----------------------------------------------------------------
    # get_decision_tree
    # -----------------------------------------------------------------
    def get_decision_tree(self, category: str) -> dict:
        """Return a decision tree structure for the given category.

        Parameters
        ----------
        category : str
            One of: chunking, retrieval, reranking.
        """
        trees = {
            "chunking": self._chunking_tree(),
            "retrieval": self._retrieval_tree(),
            "reranking": self._reranking_tree(),
        }
        tree = trees.get(category)
        if tree is None:
            raise ValueError(
                f"Unknown category '{category}'. Choose from: chunking, retrieval, reranking"
            )
        return tree

    # =================================================================
    # Internal helpers
    # =================================================================

    # -- Chunking selection ------------------------------------------------

    def _pick_chunking(
        self, doc_type: str, priority: str, budget: str
    ) -> StageRecommendation:
        if priority == "speed":
            return StageRecommendation(
                method="recursive",
                reason="Fastest general-purpose chunker with good quality",
            )
        if budget == "unlimited" and priority == "accuracy":
            return StageRecommendation(
                method="contextual",
                reason="LLM-enriched chunks give the highest retrieval accuracy",
            )

        type_map = {
            "legal": ("semantic", "Legal docs benefit from topic-boundary splitting"),
            "medical": ("semantic", "Medical documents have distinct topic sections that semantic chunking preserves"),
            "code": ("code_aware", "Preserves function and class boundaries in source code"),
            "academic": ("heading_based", "Academic papers have clear heading structure"),
            "financial": ("semantic", "Financial reports contain distinct topic sections"),
            "general": ("recursive", "Best general-purpose default for mixed content"),
        }
        method, reason = type_map.get(doc_type, ("recursive", "Safe default for unknown document types"))
        return StageRecommendation(method=method, reason=reason)

    # -- Embedding selection -----------------------------------------------

    def _pick_embedding(
        self, doc_type: str, budget: str, has_gpu: bool
    ) -> StageRecommendation:
        if budget == "free":
            return StageRecommendation(
                method="all-MiniLM-L6-v2",
                reason="Best free local embedding model, runs on CPU",
            )
        if budget == "low":
            return StageRecommendation(
                method="text-embedding-3-small",
                reason="Low-cost OpenAI embeddings with good quality",
            )
        if doc_type in ("legal", "medical", "financial"):
            return StageRecommendation(
                method="voyage-3-large",
                reason="Best cost/accuracy ratio for specialized domains",
            )
        if doc_type == "code":
            return StageRecommendation(
                method="voyage-code-3",
                reason="Code-optimized embeddings for technical content",
            )
        return StageRecommendation(
            method="text-embedding-3-large",
            reason="Strong general-purpose embeddings with excellent quality",
        )

    # -- Retrieval selection -----------------------------------------------

    def _pick_retrieval(
        self,
        query_type: str,
        corpus_size: str,
        priority: str,
        has_metadata: bool,
        budget: str,
    ) -> StageRecommendation:
        if priority == "speed":
            return StageRecommendation(
                method="dense",
                reason="Fastest retrieval, pure vector search",
            )
        if priority == "cost" and budget == "free":
            return StageRecommendation(
                method="hybrid",
                reason="Gold standard retrieval with no LLM cost",
            )

        # Query-type driven selection
        if query_type == "multi-hop":
            return StageRecommendation(
                method="sub_query",
                reason="Decomposes complex multi-hop questions into retrievable sub-queries",
            )
        if query_type == "analytical":
            return StageRecommendation(
                method="multi_query",
                reason="Generates multiple perspectives for analytical questions",
            )
        if query_type == "conversational":
            return StageRecommendation(
                method="adaptive",
                reason="Auto-routes conversational queries to the best strategy",
            )

        # Corpus-size considerations
        if corpus_size == "large" and has_metadata:
            return StageRecommendation(
                method="metadata_filter",
                reason="Pre-filters large corpus by metadata before semantic search",
            )
        if corpus_size == "large":
            return StageRecommendation(
                method="document_summary",
                reason="Two-stage retrieval efficient for large document collections",
            )

        # Budget-driven upgrades
        if budget == "unlimited":
            return StageRecommendation(
                method="corrective",
                reason="Self-correcting retrieval for maximum reliability",
            )

        # Default
        return StageRecommendation(
            method="hybrid",
            reason="Gold standard balance of semantic and keyword matching",
        )

    # -- Reranking selection -----------------------------------------------

    def _pick_reranking(
        self, priority: str, budget: str, has_gpu: bool, corpus_size: str
    ) -> StageRecommendation:
        if priority == "speed":
            return StageRecommendation(
                method="flashrank",
                reason="Ultra-lightweight CPU reranker, minimal latency impact",
            )
        if budget == "free":
            if has_gpu:
                return StageRecommendation(
                    method="bge",
                    reason="Strong open-source reranker, benefits from GPU",
                )
            return StageRecommendation(
                method="cross_encoder",
                reason="Best free reranker with excellent accuracy/speed tradeoff",
            )
        if budget == "unlimited" and priority == "accuracy":
            return StageRecommendation(
                method="listwise_llm",
                reason="Highest quality reranking via LLM holistic scoring",
            )
        if corpus_size == "large":
            return StageRecommendation(
                method="cascade",
                reason="Fast filter then precise rerank for production at scale",
            )
        return StageRecommendation(
            method="cross_encoder",
            reason="Best accuracy/speed tradeoff, standard production choice",
        )

    # -- Cost / latency estimation -----------------------------------------

    def _estimate_cost(
        self,
        chunking: StageRecommendation,
        retrieval: StageRecommendation,
        reranking: StageRecommendation,
        budget: str,
    ) -> str:
        base_cost = 0.0
        # Embedding cost (per query)
        base_cost += 0.0001

        # LLM-heavy retrieval
        llm_retrievals = {
            "multi_query", "hyde", "sub_query", "step_back",
            "adaptive", "corrective", "contextual_compression", "self_query",
        }
        if retrieval.method in llm_retrievals:
            base_cost += 0.002

        # LLM rerankers
        llm_rerankers = {"llm_pointwise", "listwise_llm", "pairwise_llm"}
        if reranking.method in llm_rerankers:
            base_cost += 0.005
        elif reranking.method == "cohere":
            base_cost += 0.001

        # Contextual chunking amortized per query
        if chunking.method == "contextual":
            base_cost += 0.001

        if base_cost < 0.001:
            return "<$0.001"
        return "~${:.3f}".format(base_cost)

    def _estimate_latency(
        self,
        retrieval: StageRecommendation,
        reranking: StageRecommendation,
        priority: str,
    ) -> str:
        ms = 200  # base search latency

        slow_retrievals = {
            "multi_query", "hyde", "sub_query", "step_back",
            "corrective", "contextual_compression", "adaptive",
        }
        if retrieval.method in slow_retrievals:
            ms += 800

        slow_rerankers = {"llm_pointwise", "listwise_llm", "pairwise_llm"}
        moderate_rerankers = {
            "cross_encoder", "cohere", "bge", "diversity",
            "contextual_rerank", "cascade",
        }
        if reranking.method in slow_rerankers:
            ms += 2000
        elif reranking.method in moderate_rerankers:
            ms += 300

        return "~{}ms".format(ms)

    # =================================================================
    # Decision trees
    # =================================================================

    def _chunking_tree(self) -> dict:
        return {
            "question": "What type of document are you chunking?",
            "options": {
                "Source code or technical docs with code": {
                    "recommendation": "code_aware",
                    "reason": "Preserves code block integrity",
                },
                "Markdown/HTML with clear headings": {
                    "recommendation": "heading_based",
                    "reason": "Leverages document structure for natural splits",
                },
                "Long-form text with topic changes": {
                    "question": "Is budget a concern?",
                    "options": {
                        "Yes": {
                            "recommendation": "semantic",
                            "reason": "Detects topic boundaries using embeddings",
                        },
                        "No": {
                            "recommendation": "contextual",
                            "reason": "Highest quality with LLM-generated context per chunk",
                        },
                    },
                },
                "Well-formatted text with clear paragraphs": {
                    "recommendation": "paragraph",
                    "reason": "Respects author's paragraph structure",
                },
                "Q&A or factoid-dense content": {
                    "recommendation": "sentence_window",
                    "reason": "Sentence-level precision with context windows",
                },
                "General / unsure": {
                    "recommendation": "recursive",
                    "reason": "Best general-purpose default, start here",
                },
            },
        }

    def _retrieval_tree(self) -> dict:
        return {
            "question": "What is your top priority?",
            "options": {
                "Speed": {
                    "recommendation": "dense",
                    "reason": "Fastest retrieval, pure vector search",
                },
                "Cost (free)": {
                    "recommendation": "hybrid",
                    "reason": "Best free retrieval combining semantic + keyword",
                },
                "Accuracy": {
                    "question": "What type of queries will users ask?",
                    "options": {
                        "Simple factoid questions": {
                            "recommendation": "hybrid",
                            "reason": "Gold standard for production, handles most queries well",
                        },
                        "Ambiguous or varied queries": {
                            "recommendation": "multi_query",
                            "reason": "LLM generates query variants to cover ambiguity",
                        },
                        "Complex multi-part questions": {
                            "recommendation": "sub_query",
                            "reason": "Breaks complex queries into retrievable sub-questions",
                        },
                        "Specific technical questions": {
                            "recommendation": "step_back",
                            "reason": "Generates abstract query for broader context first",
                        },
                        "Mixed query types": {
                            "recommendation": "adaptive",
                            "reason": "Auto-routes to the best strategy per query",
                        },
                    },
                },
                "Reliability": {
                    "recommendation": "corrective",
                    "reason": "Self-correcting retrieval that re-retrieves on low quality",
                },
            },
        }

    def _reranking_tree(self) -> dict:
        return {
            "question": "What is your top priority for reranking?",
            "options": {
                "Speed / low resources": {
                    "recommendation": "flashrank",
                    "reason": "Ultra-lightweight, CPU-only, fastest neural reranker",
                },
                "Accuracy (free)": {
                    "question": "Do you have a GPU?",
                    "options": {
                        "Yes": {
                            "recommendation": "bge",
                            "reason": "Strong open-source model, benefits from GPU",
                        },
                        "No": {
                            "recommendation": "cross_encoder",
                            "reason": "Best free accuracy/speed tradeoff on CPU",
                        },
                    },
                },
                "Accuracy (with budget)": {
                    "question": "How large is your candidate set?",
                    "options": {
                        "Large (20+)": {
                            "recommendation": "cascade",
                            "reason": "Multi-stage: fast filter then precise rerank",
                        },
                        "Medium (5-20)": {
                            "recommendation": "listwise_llm",
                            "reason": "Highest quality via holistic LLM ranking",
                        },
                        "Small (3-8)": {
                            "recommendation": "pairwise_llm",
                            "reason": "Precise pairwise LLM comparison",
                        },
                    },
                },
                "Reduce redundancy": {
                    "recommendation": "diversity",
                    "reason": "MMR-based reranking for diverse results",
                },
                "Free accuracy boost (always add)": {
                    "recommendation": "lost_in_middle",
                    "reason": "Reorders for LLM attention patterns, zero cost",
                },
            },
        }


# Module-level singleton
decision_engine = DecisionEngine()
