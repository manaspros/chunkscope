"""
CodeGenerator -- turns a pipeline configuration dict into a complete,
runnable RAG project (dict of filename -> file content).
"""
from __future__ import annotations

from app.services.code_generator.templates import (
    chunker_template,
    docker_compose_template,
    dockerfile_template,
    env_template,
    main_template,
    pipeline_template,
    readme_template,
    requirements_template,
)

# Mapping from embedding model names to their vector dimensions
_EMBEDDING_DIMS: dict[str, int] = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "cohere-embed-v4": 1024,
    "voyage-3-large": 1024,
    "jina-embeddings-v3": 1024,
    "all-MiniLM-L6-v2": 384,
    "bge-m3": 1024,
    "nomic-embed-text-v1.5": 768,
}

# Which pip packages each embedding model needs
_EMBEDDING_PACKAGES: dict[str, list[str]] = {
    "text-embedding-3-small": ["openai"],
    "text-embedding-3-large": ["openai"],
    "cohere-embed-v4": ["cohere"],
    "voyage-3-large": ["voyageai"],
    "jina-embeddings-v3": ["openai"],  # Jina uses an OpenAI-compatible API
    "all-MiniLM-L6-v2": ["sentence-transformers"],
    "bge-m3": ["sentence-transformers"],
    "nomic-embed-text-v1.5": ["sentence-transformers"],
}

# Classify embedding models by provider type
_EMBEDDING_PROVIDER: dict[str, str] = {
    "text-embedding-3-small": "openai",
    "text-embedding-3-large": "openai",
    "cohere-embed-v4": "cohere",
    "voyage-3-large": "voyage",
    "jina-embeddings-v3": "jina",
    "all-MiniLM-L6-v2": "local",
    "bge-m3": "local",
    "nomic-embed-text-v1.5": "local",
}

# LLM provider -> package
_LLM_PACKAGES: dict[str, list[str]] = {
    "gpt-4o-mini": ["openai"],
    "gpt-4o": ["openai"],
    "claude-3-haiku": ["anthropic"],
    "claude-3-sonnet": ["anthropic"],
}

_LLM_PROVIDER: dict[str, str] = {
    "gpt-4o-mini": "openai",
    "gpt-4o": "openai",
    "claude-3-haiku": "anthropic",
    "claude-3-sonnet": "anthropic",
}


class CodeGenerator:
    """Generate a standalone RAG project from a pipeline configuration."""

    def generate(self, pipeline_config: dict) -> dict[str, str]:
        """
        Turn *pipeline_config* into a dict of ``filename -> file content``.

        Expected keys in *pipeline_config*:
            - chunking_method  (str)  -- "fixed", "recursive", "sentence", "paragraph"
            - chunk_size       (int)
            - overlap          (int)
            - embedding_model  (str)
            - retrieval_top_k  (int, default 5)
            - reranker         (str | None) -- "none", "cohere", "cross-encoder"
            - llm_model        (str)
        """
        cfg = self._normalise(pipeline_config)

        return {
            "main.py": self._render_main(cfg),
            "pipeline.py": self._render_pipeline(cfg),
            "chunker.py": chunker_template,
            "requirements.txt": self._render_requirements(cfg),
            "Dockerfile": dockerfile_template,
            "docker-compose.yml": docker_compose_template,
            ".env.example": self._render_env(cfg),
            "README.md": self._render_readme(cfg),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalise(cfg: dict) -> dict:
        """Fill in defaults and normalise values."""
        out = dict(cfg)
        out.setdefault("chunking_method", "recursive")
        out.setdefault("chunk_size", 512)
        out.setdefault("overlap", 50)
        out.setdefault("embedding_model", "text-embedding-3-small")
        out.setdefault("retrieval_top_k", 5)
        out.setdefault("reranker", "none")
        out.setdefault("llm_model", "gpt-4o-mini")
        if out["reranker"] is None:
            out["reranker"] = "none"
        return out

    # ---- main.py ----

    @staticmethod
    def _render_main(cfg: dict) -> str:
        emb_model = cfg["embedding_model"]
        dim = _EMBEDDING_DIMS.get(emb_model, 1536)
        return main_template.format(
            top_k=cfg["retrieval_top_k"],
            embedding_dim=dim,
        )

    # ---- pipeline.py ----

    def _render_pipeline(self, cfg: dict) -> str:
        emb_model = cfg["embedding_model"]
        llm_model = cfg["llm_model"]
        reranker = cfg["reranker"]

        extra_imports = self._build_extra_imports(emb_model, llm_model, reranker)
        embed_body = self._build_embed_body(emb_model)
        rerank_body = self._build_rerank_body(reranker)
        generate_body = self._build_generate_body(llm_model)

        return pipeline_template.format(
            chunking_method=cfg["chunking_method"],
            chunk_size=cfg["chunk_size"],
            overlap=cfg["overlap"],
            embedding_model=emb_model,
            reranker=reranker,
            llm_model=llm_model,
            extra_imports=extra_imports,
            embed_body=embed_body,
            rerank_body=rerank_body,
            generate_body=generate_body,
        )

    # ---- requirements.txt ----

    @staticmethod
    def _render_requirements(cfg: dict) -> str:
        pkgs: set[str] = set()
        pkgs.update(_EMBEDDING_PACKAGES.get(cfg["embedding_model"], []))
        pkgs.update(_LLM_PACKAGES.get(cfg["llm_model"], []))

        reranker = cfg["reranker"]
        if reranker == "cohere":
            pkgs.add("cohere")
        elif reranker == "cross-encoder":
            pkgs.add("sentence-transformers")

        # pgvector helpers
        pkgs.add("pgvector")

        extra = "\n".join(f"{p}" for p in sorted(pkgs))
        return requirements_template.format(extra_requirements=extra)

    # ---- .env.example ----

    @staticmethod
    def _render_env(cfg: dict) -> str:
        emb_provider = _EMBEDDING_PROVIDER.get(cfg["embedding_model"], "openai")
        llm_provider = _LLM_PROVIDER.get(cfg["llm_model"], "openai")

        env_emb_lines: list[str] = []
        if emb_provider == "openai":
            env_emb_lines.append("OPENAI_API_KEY=sk-...")
        elif emb_provider == "cohere":
            env_emb_lines.append("COHERE_API_KEY=...")
        elif emb_provider == "voyage":
            env_emb_lines.append("VOYAGE_API_KEY=...")
        elif emb_provider == "jina":
            env_emb_lines.append("JINA_API_KEY=...")
        else:
            env_emb_lines.append("# No API key needed for local embedding model")

        env_llm_lines: list[str] = []
        if llm_provider == "openai":
            # Might already have OPENAI_API_KEY from embedding
            if "OPENAI_API_KEY" not in "\n".join(env_emb_lines):
                env_llm_lines.append("OPENAI_API_KEY=sk-...")
            env_llm_lines.append(f"LLM_MODEL={cfg['llm_model']}")
        elif llm_provider == "anthropic":
            env_llm_lines.append("ANTHROPIC_API_KEY=sk-ant-...")
            env_llm_lines.append(f"LLM_MODEL={cfg['llm_model']}")

        return env_template.format(
            env_embedding_vars="\n".join(env_emb_lines),
            env_llm_vars="\n".join(env_llm_lines),
        )

    # ---- README.md ----

    @staticmethod
    def _render_readme(cfg: dict) -> str:
        return readme_template.format(
            chunking_method=cfg["chunking_method"],
            chunk_size=cfg["chunk_size"],
            overlap=cfg["overlap"],
            embedding_model=cfg["embedding_model"],
            top_k=cfg["retrieval_top_k"],
            reranker=cfg["reranker"],
            llm_model=cfg["llm_model"],
        )

    # ------------------------------------------------------------------
    # Code-block builders (pipeline.py bodies)
    # ------------------------------------------------------------------

    @staticmethod
    def _build_extra_imports(emb_model: str, llm_model: str, reranker: str) -> str:
        lines: list[str] = []
        emb_prov = _EMBEDDING_PROVIDER.get(emb_model, "openai")
        llm_prov = _LLM_PROVIDER.get(llm_model, "openai")

        if emb_prov == "openai" or llm_prov == "openai":
            lines.append("import openai")
        if emb_prov == "cohere" or reranker == "cohere":
            lines.append("import cohere")
        if llm_prov == "anthropic":
            lines.append("import anthropic")
        if emb_prov == "voyage":
            lines.append("import voyageai")
        if emb_prov == "local":
            lines.append("from sentence_transformers import SentenceTransformer")
        if reranker == "cross-encoder":
            lines.append("from sentence_transformers import CrossEncoder")

        return "\n".join(lines)

    @staticmethod
    def _build_embed_body(emb_model: str) -> str:
        provider = _EMBEDDING_PROVIDER.get(emb_model, "openai")

        if provider == "openai":
            return (
                '    client = openai.OpenAI()\n'
                '    resp = client.embeddings.create(input=chunks, model="{model}")\n'
                '    return [item.embedding for item in resp.data]'
            ).format(model=emb_model)

        if provider == "cohere":
            return (
                '    co = cohere.Client(os.getenv("COHERE_API_KEY"))\n'
                '    resp = co.embed(texts=chunks, model="{model}", input_type="search_document")\n'
                '    return resp.embeddings'
            ).format(model=emb_model)

        if provider == "voyage":
            return (
                '    vo = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))\n'
                '    resp = vo.embed(chunks, model="{model}")\n'
                '    return resp.embeddings'
            ).format(model=emb_model)

        if provider == "jina":
            return (
                '    client = openai.OpenAI(\n'
                '        api_key=os.getenv("JINA_API_KEY"),\n'
                '        base_url="https://api.jina.ai/v1",\n'
                '    )\n'
                '    resp = client.embeddings.create(input=chunks, model="{model}")\n'
                '    return [item.embedding for item in resp.data]'
            ).format(model=emb_model)

        # local
        return (
            '    model = SentenceTransformer("{model}")\n'
            '    return model.encode(chunks).tolist()'
        ).format(model=emb_model)

    @staticmethod
    def _build_rerank_body(reranker: str) -> str:
        if reranker == "cohere":
            return (
                '    co = cohere.Client(os.getenv("COHERE_API_KEY"))\n'
                '    docs = [r["content"] for r in results]\n'
                '    resp = co.rerank(query=query, documents=docs, top_n=len(docs))\n'
                '    reranked = [results[hit.index] for hit in resp.results]\n'
                '    return reranked'
            )
        if reranker == "cross-encoder":
            return (
                '    ce = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")\n'
                '    pairs = [(query, r["content"]) for r in results]\n'
                '    scores = ce.predict(pairs)\n'
                '    ranked = sorted(zip(scores, results), key=lambda x: x[0], reverse=True)\n'
                '    return [r for _, r in ranked]'
            )
        # no reranker
        return "    return results  # No reranking configured"

    @staticmethod
    def _build_generate_body(llm_model: str) -> str:
        provider = _LLM_PROVIDER.get(llm_model, "openai")

        if provider == "openai":
            return (
                '    client = openai.OpenAI()\n'
                '    messages = [\n'
                '        {{"role": "system", "content": "Answer the question using ONLY the context below.\\n\\nContext:\\n" + context}},\n'
                '        {{"role": "user", "content": query}},\n'
                '    ]\n'
                '    resp = client.chat.completions.create(model="{model}", messages=messages)\n'
                '    return resp.choices[0].message.content'
            ).format(model=llm_model)

        # anthropic
        return (
            '    client = anthropic.Anthropic()\n'
            '    message = client.messages.create(\n'
            '        model="{model}",\n'
            '        max_tokens=1024,\n'
            '        system="Answer the question using ONLY the context below.\\n\\nContext:\\n" + context,\n'
            '        messages=[{{"role": "user", "content": query}}],\n'
            '    )\n'
            '    return message.content[0].text'
        ).format(model=llm_model)
