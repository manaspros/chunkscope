import json
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class AdaptiveRetriever(BaseRetriever):
    """
    Classifies query complexity (simple/moderate/complex) using an LLM
    and routes to the appropriate retrieval strategy:

    - Simple: single dense retrieval
    - Moderate: hybrid retrieval
    - Complex: sub-query decomposition + hybrid + reranking
    """

    def __init__(
        self,
        simple_retriever: BaseRetriever,
        moderate_retriever: BaseRetriever,
        complex_retriever: BaseRetriever,
        model: str = "gpt-4o-mini",
    ):
        """
        Args:
            simple_retriever: Used for simple queries (e.g., a dense retriever).
            moderate_retriever: Used for moderate queries (e.g., a hybrid retriever).
            complex_retriever: Used for complex queries (e.g., sub-query + reranking).
            model: LLM model for query classification.
        """
        self.simple_retriever = simple_retriever
        self.moderate_retriever = moderate_retriever
        self.complex_retriever = complex_retriever
        self.model = model

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Step 1: Classify query complexity
        complexity = await self._classify_complexity(query)

        # Step 2: Route to appropriate retriever
        if complexity == "simple":
            retriever = self.simple_retriever
        elif complexity == "moderate":
            retriever = self.moderate_retriever
        else:  # complex
            retriever = self.complex_retriever

        results = await retriever.retrieve(
            query, top_k=top_k, document_id=document_id, **kwargs
        )

        # Add routing metadata
        for result in results:
            result["metadata"] = {
                **(result.get("metadata") or {}),
                "strategy": "adaptive",
                "classified_complexity": complexity,
            }

        return results

    async def _classify_complexity(self, query: str) -> str:
        """Use LLM to classify query as simple, moderate, or complex."""
        prompt = (
            "Classify the complexity of this search query as one of: "
            "simple, moderate, complex.\n\n"
            "- simple: straightforward factual question, single topic\n"
            "- moderate: requires combining 2-3 concepts or some reasoning\n"
            "- complex: multi-part question, requires synthesis across topics, "
            "or involves comparisons/analysis\n\n"
            f"Query: {query}\n\n"
            'Return only a JSON object: {{"complexity": "simple|moderate|complex"}}'
        )

        response = await llm_service.generate(
            prompt=prompt,
            system_prompt="You are a query complexity classifier. Return only valid JSON.",
            model=self.model,
            temperature=0.0,
            max_tokens=32,
        )

        try:
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
                response = response.strip()
            parsed = json.loads(response)
            complexity = parsed.get("complexity", "moderate").lower()
            if complexity in ("simple", "moderate", "complex"):
                return complexity
        except (json.JSONDecodeError, AttributeError):
            pass

        return "moderate"  # default fallback
