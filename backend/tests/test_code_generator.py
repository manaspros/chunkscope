"""
Tests for the Code Generator service.
"""
import io
import zipfile

import pytest

from app.services.code_generator import CodeGenerator, build_zip


@pytest.fixture
def generator():
    return CodeGenerator()


@pytest.fixture
def default_config():
    return {
        "chunking_method": "recursive",
        "chunk_size": 512,
        "overlap": 50,
        "embedding_model": "text-embedding-3-small",
        "retrieval_top_k": 5,
        "reranker": "none",
        "llm_model": "gpt-4o-mini",
    }


EXPECTED_FILES = {
    "main.py",
    "pipeline.py",
    "chunker.py",
    "requirements.txt",
    "Dockerfile",
    "docker-compose.yml",
    ".env.example",
    "README.md",
}


class TestCodeGeneratorOutput:
    """Verify that generate() returns all expected files."""

    def test_returns_all_expected_files(self, generator, default_config):
        files = generator.generate(default_config)
        assert set(files.keys()) == EXPECTED_FILES

    def test_all_files_are_nonempty_strings(self, generator, default_config):
        files = generator.generate(default_config)
        for name, content in files.items():
            assert isinstance(content, str), f"{name} is not a string"
            assert len(content) > 0, f"{name} is empty"


class TestRequirementsDependencies:
    """Generated requirements.txt includes the right deps for the config."""

    def test_openai_embedding_includes_openai(self, generator):
        cfg = {"embedding_model": "text-embedding-3-small", "llm_model": "gpt-4o-mini"}
        files = generator.generate(cfg)
        assert "openai" in files["requirements.txt"]

    def test_cohere_embedding_includes_cohere(self, generator):
        cfg = {"embedding_model": "cohere-embed-v4", "llm_model": "gpt-4o-mini"}
        files = generator.generate(cfg)
        assert "cohere" in files["requirements.txt"]

    def test_local_embedding_includes_sentence_transformers(self, generator):
        cfg = {"embedding_model": "all-MiniLM-L6-v2", "llm_model": "gpt-4o-mini"}
        files = generator.generate(cfg)
        assert "sentence-transformers" in files["requirements.txt"]

    def test_anthropic_llm_includes_anthropic(self, generator):
        cfg = {"embedding_model": "text-embedding-3-small", "llm_model": "claude-3-haiku"}
        files = generator.generate(cfg)
        assert "anthropic" in files["requirements.txt"]

    def test_pgvector_always_included(self, generator, default_config):
        files = generator.generate(default_config)
        assert "pgvector" in files["requirements.txt"]

    def test_cohere_reranker_includes_cohere(self, generator):
        cfg = {
            "embedding_model": "text-embedding-3-small",
            "llm_model": "gpt-4o-mini",
            "reranker": "cohere",
        }
        files = generator.generate(cfg)
        assert "cohere" in files["requirements.txt"]

    def test_cross_encoder_reranker_includes_sentence_transformers(self, generator):
        cfg = {
            "embedding_model": "text-embedding-3-small",
            "llm_model": "gpt-4o-mini",
            "reranker": "cross-encoder",
        }
        files = generator.generate(cfg)
        assert "sentence-transformers" in files["requirements.txt"]


class TestGeneratedCodeContent:
    """Generated code embeds the correct config values."""

    def test_chunk_size_in_pipeline(self, generator):
        cfg = {"chunk_size": 1024, "overlap": 100}
        files = generator.generate(cfg)
        assert "chunk_size=1024" in files["pipeline.py"]
        assert "overlap=100" in files["pipeline.py"]

    def test_embedding_model_in_pipeline(self, generator):
        cfg = {"embedding_model": "text-embedding-3-large"}
        files = generator.generate(cfg)
        assert "text-embedding-3-large" in files["pipeline.py"]

    def test_llm_model_in_pipeline(self, generator):
        cfg = {"llm_model": "claude-3-sonnet"}
        files = generator.generate(cfg)
        assert "claude-3-sonnet" in files["pipeline.py"]
        assert "anthropic" in files["pipeline.py"]

    def test_reranker_none_returns_results_directly(self, generator, default_config):
        files = generator.generate(default_config)
        assert "return results" in files["pipeline.py"]

    def test_reranker_cohere_uses_cohere(self, generator):
        cfg = {"reranker": "cohere"}
        files = generator.generate(cfg)
        assert "cohere" in files["pipeline.py"].lower()

    def test_chunking_method_in_pipeline(self, generator):
        cfg = {"chunking_method": "sentence"}
        files = generator.generate(cfg)
        assert 'method="sentence"' in files["pipeline.py"]

    def test_readme_contains_config(self, generator):
        cfg = {
            "chunking_method": "paragraph",
            "chunk_size": 768,
            "embedding_model": "bge-m3",
            "llm_model": "gpt-4o",
        }
        files = generator.generate(cfg)
        readme = files["README.md"]
        assert "paragraph" in readme
        assert "768" in readme
        assert "bge-m3" in readme
        assert "gpt-4o" in readme


class TestDefaultConfig:
    """Generating with an empty config should use sane defaults."""

    def test_empty_config_uses_defaults(self, generator):
        files = generator.generate({})
        assert set(files.keys()) == EXPECTED_FILES
        assert "recursive" in files["pipeline.py"]
        assert "text-embedding-3-small" in files["pipeline.py"]


class TestZipBuilder:
    """build_zip produces a valid ZIP containing all files."""

    def test_valid_zip(self, generator, default_config):
        files = generator.generate(default_config)
        zip_bytes = build_zip(files)

        assert isinstance(zip_bytes, bytes)
        assert len(zip_bytes) > 0

        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf) as zf:
            names = set(zf.namelist())
            assert names == EXPECTED_FILES
            for name in names:
                assert len(zf.read(name)) > 0

    def test_empty_dict_produces_valid_zip(self):
        zip_bytes = build_zip({})
        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf) as zf:
            assert zf.namelist() == []
