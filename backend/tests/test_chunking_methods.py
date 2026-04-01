import pytest
from unittest.mock import MagicMock
from app.services.chunkers.sentence_window_chunker import SentenceWindowChunker
from app.services.chunkers.paragraph_chunker import ParagraphChunker
from app.services.chunkers.code_aware_chunker import CodeAwareChunker
from app.services.chunkers.heading_based_chunker import HeadingBasedChunker
from app.services.chunkers.recursive_chunker import RecursiveChunker
from app.services.chunkers.contextual_chunker import ContextualChunker
from app.schemas.chunk import ChunkingConfig

SAMPLE_TEXT = """# Section 1
This is the first paragraph. It has two sentences.

This is the second paragraph.
It spans multiple lines.

## Subsection 1.1
Here is some code:
```python
def hello():
    print("Hello world")
    return True
```

### Subsection 1.1.1
Final paragraph here."""

@pytest.fixture
def config():
    return ChunkingConfig(
        method="test",
        chunk_size=50,
        overlap=0,
        window_size=2
    )

def test_sentence_window_chunker(config):
    chunker = SentenceWindowChunker()
    text = "Sentence one. Sentence two. Sentence three. Sentence four."
    
    # window_size=2, overlap=0 -> chunks of 2 sentences, step 2
    # [1, 2], [3, 4]
    chunks = chunker.chunk(text, config)
    assert len(chunks) == 2
    assert "Sentence one." in chunks[0]["text"]
    assert "Sentence two." in chunks[0]["text"]
    assert "Sentence three." in chunks[1]["text"]
    
    # window_size=2, overlap=1 -> chunks of 2 sentences, step 1
    # [1, 2], [2, 3], [3, 4]
    config.overlap = 1
    chunks = chunker.chunk(text, config)
    assert len(chunks) == 3
    assert "Sentence two." in chunks[0]["text"]
    assert "Sentence two." in chunks[1]["text"]

def test_paragraph_chunker(config):
    chunker = ParagraphChunker()
    # Paragraphs separated by \n\n
    text = "Para 1.\n\nPara 2.\n\nPara 3."
    
    config.chunk_size = 15 # small enough to force split
    chunks = chunker.chunk(text, config)
    
    assert len(chunks) == 3
    assert chunks[0]["text"] == "Para 1."
    assert chunks[1]["text"] == "Para 2."
    assert chunks[2]["text"] == "Para 3."
    
    # Test combining (if chunk_size is large enough and logic permits)
    # Current implementation greedy adds until full? 
    # Let's re-read implementation: compares (end - current_chunk_start) > config.chunk_size.
    # If size is HUGE, it might combine everything if logic allows?
    # Actually logic is: if adding next EXCEEDS, then split. 
    # So if chunk_size is small, it splits. If large, it combines.
    
    config.chunk_size = 1000
    chunks = chunker.chunk(text, config)
    # Should be 1 chunk properly? 
    # Implementation: 
    # if (end - current_chunk_start) > config.chunk_size: split
    # else: combine
    # So with size 1000, it should combine all 3.
    assert len(chunks) == 1
    assert "Para 3" in chunks[0]["text"]

def test_code_aware_chunker(config):
    chunker = CodeAwareChunker()
    text = "Prose before.\n```\ncode block\n```\nProse after."
    
    chunks = chunker.chunk(text, config)
    
    # Should detect 3 parts: Prose, Code, Prose
    assert len(chunks) >= 3
    
    # Find code chunk
    code_chunks = [c for c in chunks if c.get("metadata", {}).get("type") == "code"]
    assert len(code_chunks) == 1
    assert "code block" in code_chunks[0]["text"]
    assert "```" in code_chunks[0]["text"]

def test_heading_based_chunker(config):
    chunker = HeadingBasedChunker()
    text = "# Header 1\nContent 1\n## Header 2\nContent 2"
    
    chunks = chunker.chunk(text, config)
    
    assert len(chunks) == 2
    assert chunks[0]["metadata"]["heading"] == "Header 1"
    assert chunks[0]["metadata"]["level"] == 1
    assert "Content 1" in chunks[0]["text"]
    
    assert chunks[1]["metadata"]["heading"] == "Header 2"
    assert chunks[1]["metadata"]["level"] == 2
    assert "Content 2" in chunks[1]["text"]

def test_recursive_chunker(config):
    chunker = RecursiveChunker()
    text = "A" * 100
    config.chunk_size = 20
    config.overlap = 0

    chunks = chunker.chunk(text, config)
    assert len(chunks) == 5
    assert len(chunks[0]["text"]) == 20


class TestRecursiveChunkerOffsets:
    """Tests for the RecursiveChunker offset tracking fix (duplicate text segments)."""

    def test_duplicate_segments_have_correct_offsets(self):
        """When the same text appears multiple times, each chunk should get the right offset."""
        chunker = RecursiveChunker()
        # Three identical paragraphs separated by double newlines
        text = "Hello world\n\nHello world\n\nHello world"
        config = ChunkingConfig(method="recursive", chunk_size=200, overlap=0)
        chunks = chunker.chunk(text, config)

        # All text fits in one chunk
        assert len(chunks) == 1
        assert chunks[0]["start_char"] == 0

        # Force splitting by making chunk_size small
        config.chunk_size = 15
        chunks = chunker.chunk(text, config)
        assert len(chunks) >= 3

        # Verify every chunk's offset is consistent with original text
        for chunk in chunks:
            start = chunk["start_char"]
            end = chunk["end_char"]
            assert start >= 0, f"start_char should be non-negative, got {start}"
            assert end >= start, f"end_char ({end}) should be >= start_char ({start})"
            assert end <= len(text), f"end_char ({end}) should be <= len(text) ({len(text)})"
            # The text extracted by offsets must match the chunk text
            assert text[start:end] == chunk["text"], (
                f"Offset mismatch: text[{start}:{end}] = {text[start:end]!r} "
                f"!= chunk text {chunk['text']!r}"
            )

    def test_offsets_cover_full_text(self):
        """Chunks should collectively cover the original text (no gaps, no wrong positions)."""
        chunker = RecursiveChunker()
        text = "aaa bbb\n\naaa bbb\n\nccc ddd"
        config = ChunkingConfig(method="recursive", chunk_size=10, overlap=0)
        chunks = chunker.chunk(text, config)

        for chunk in chunks:
            start = chunk["start_char"]
            end = chunk["end_char"]
            assert text[start:end] == chunk["text"]

    def test_repeated_single_words(self):
        """Repeated identical words should each map to distinct positions."""
        chunker = RecursiveChunker()
        # Use longer repeated segments so chunk_size >= 10 is respected
        text = "go go go\n\ngo go go\n\ngo go go"
        config = ChunkingConfig(method="recursive", chunk_size=10, overlap=0)
        chunks = chunker.chunk(text, config)

        seen_starts = set()
        for chunk in chunks:
            start = chunk["start_char"]
            # Each chunk should have a unique start position
            assert start not in seen_starts, f"Duplicate start_char {start}"
            seen_starts.add(start)
            assert text[start:chunk["end_char"]] == chunk["text"]


class TestContextualChunker:
    """Tests for the ContextualChunker (Anthropic's Contextual Retrieval approach)."""

    def test_no_llm_fn_returns_base_chunks(self):
        """Without an llm_fn, contextual chunker returns chunks unchanged."""
        base_chunker = RecursiveChunker()
        chunker = ContextualChunker(base_chunker=base_chunker, llm_fn=None)
        text = "Hello world. This is a test."
        config = ChunkingConfig(method="contextual", chunk_size=500, overlap=0)

        chunks = chunker.chunk(text, config)
        base_chunks = base_chunker.chunk(text, config)

        assert len(chunks) == len(base_chunks)
        for c, b in zip(chunks, base_chunks):
            assert c["text"] == b["text"]

    def test_llm_fn_prepends_preamble(self):
        """When llm_fn is provided, each chunk gets a contextual preamble prepended."""
        mock_llm = MagicMock(return_value="This chunk discusses testing.")
        base_chunker = RecursiveChunker()
        chunker = ContextualChunker(base_chunker=base_chunker, llm_fn=mock_llm)
        text = "Hello world. This is a test document with some content."
        config = ChunkingConfig(method="contextual", chunk_size=500, overlap=0)

        chunks = chunker.chunk(text, config)

        assert len(chunks) >= 1
        # The LLM should have been called once per chunk
        assert mock_llm.call_count == len(chunks)
        for chunk in chunks:
            assert chunk["text"].startswith("This chunk discusses testing.")
            assert "context_preamble" in chunk["metadata"]
            assert chunk["metadata"]["context_preamble"] == "This chunk discusses testing."
            assert "original_text" in chunk["metadata"]

    def test_llm_fn_receives_correct_prompt(self):
        """The prompt passed to llm_fn should contain the document and chunk text."""
        captured_prompts = []

        def capturing_llm(prompt: str) -> str:
            captured_prompts.append(prompt)
            return "Context here."

        base_chunker = RecursiveChunker()
        chunker = ContextualChunker(base_chunker=base_chunker, llm_fn=capturing_llm)
        text = "Document content for testing."
        config = ChunkingConfig(method="contextual", chunk_size=500, overlap=0)

        chunks = chunker.chunk(text, config)

        assert len(captured_prompts) == len(chunks)
        for prompt in captured_prompts:
            assert "Here is the full document:" in prompt
            assert "Document content for testing." in prompt
            assert "Here is a chunk from the document:" in prompt

    def test_llm_fn_failure_falls_back_to_original(self):
        """If llm_fn raises, the original chunk is returned without preamble."""
        def failing_llm(prompt: str) -> str:
            raise RuntimeError("LLM service unavailable")

        base_chunker = RecursiveChunker()
        chunker = ContextualChunker(base_chunker=base_chunker, llm_fn=failing_llm)
        text = "Some test content."
        config = ChunkingConfig(method="contextual", chunk_size=500, overlap=0)

        chunks = chunker.chunk(text, config)
        base_chunks = base_chunker.chunk(text, config)

        assert len(chunks) == len(base_chunks)
        for c, b in zip(chunks, base_chunks):
            assert c["text"] == b["text"]

    def test_multiple_chunks_each_get_context(self):
        """Each chunk in a multi-chunk split gets its own preamble."""
        call_count = 0

        def counting_llm(prompt: str) -> str:
            nonlocal call_count
            call_count += 1
            return f"Context for chunk {call_count}."

        base_chunker = RecursiveChunker()
        text = "A" * 100
        config = ChunkingConfig(method="contextual", chunk_size=20, overlap=0)
        chunker = ContextualChunker(base_chunker=base_chunker, llm_fn=counting_llm)

        chunks = chunker.chunk(text, config)

        assert len(chunks) == 5
        assert call_count == 5
        # Each chunk should have a unique preamble
        preambles = [c["metadata"]["context_preamble"] for c in chunks]
        assert len(set(preambles)) == 5
