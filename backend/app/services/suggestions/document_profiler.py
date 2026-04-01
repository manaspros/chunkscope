"""
Document Profiler
Analyzes a document and produces a detailed profile for RAG configuration recommendations.
"""
import re
from collections import Counter
from dataclasses import dataclass, field

from app.core.logging import get_logger

logger = get_logger(__name__)

# Common English stop words for topic extraction
STOP_WORDS = frozenset({
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "aren", "as", "at", "be", "because", "been",
    "before", "being", "below", "between", "both", "but", "by", "can",
    "could", "did", "do", "does", "doing", "don", "down", "during", "each",
    "few", "for", "from", "further", "get", "got", "had", "has", "have",
    "having", "he", "her", "here", "hers", "herself", "him", "himself",
    "his", "how", "i", "if", "in", "into", "is", "isn", "it", "its",
    "itself", "just", "let", "ll", "may", "me", "might", "more", "most",
    "must", "my", "myself", "no", "nor", "not", "now", "of", "off", "on",
    "once", "only", "or", "other", "our", "ours", "ourselves", "out",
    "over", "own", "re", "s", "same", "shall", "she", "should", "so",
    "some", "such", "t", "than", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those",
    "through", "to", "too", "under", "until", "up", "ve", "very", "was",
    "wasn", "we", "were", "weren", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "won", "would", "you",
    "your", "yours", "yourself", "yourselves", "also", "been", "being",
    "one", "two", "new", "used", "use", "using", "well", "make", "made",
})


@dataclass
class DocumentProfile:
    """Detailed profile of a document for RAG configuration recommendations."""

    doc_type: str  # legal, medical, code, academic, financial, general
    total_chars: int
    total_words: int
    total_sentences: int
    total_paragraphs: int
    avg_sentence_length: float
    avg_paragraph_length: float
    vocabulary_diversity: float  # unique words / total words
    heading_count: int
    table_count: int
    code_block_count: int
    list_count: int
    has_complex_structure: bool  # tables + headings > threshold
    content_density: float  # chars per paragraph
    repetition_score: float  # 0-1, how much text is repeated (shingling)
    language_complexity: str  # simple, moderate, complex
    top_topics: list[str] = field(default_factory=list)


class DocumentProfiler:
    """Analyzes a document and produces a detailed profile."""

    def __init__(self):
        # Lazy import to avoid circular dependency at module level
        self._analyzer = None

    def _get_analyzer(self):
        """Get the existing document analyzer (lazy load)."""
        if self._analyzer is None:
            from app.services.document_analyzer import DocumentAnalyzer
            self._analyzer = DocumentAnalyzer()
        return self._analyzer

    def profile(self, text: str, doc_type: str | None = None) -> DocumentProfile:
        """
        Analyze text and produce a detailed document profile.

        Args:
            text: The document text to profile.
            doc_type: Optional pre-classified document type. If None, uses
                      the existing document_analyzer's quick_classify.

        Returns:
            A DocumentProfile dataclass with all computed metrics.
        """
        if doc_type is None:
            doc_type = self._classify_text(text)

        total_chars = len(text)
        words = re.findall(r"\b\w+\b", text)
        total_words = len(words)
        words_lower = [w.lower() for w in words]

        # Sentences: split on sentence-ending punctuation
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        total_sentences = len(sentences)

        # Paragraphs: split on double newlines or multiple whitespace lines
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        total_paragraphs = max(len(paragraphs), 1)

        # Sentence lengths
        sentence_lengths = [len(s.split()) for s in sentences]
        avg_sentence_length = (
            sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0.0
        )

        # Paragraph lengths (in words)
        paragraph_word_counts = [len(p.split()) for p in paragraphs]
        avg_paragraph_length = (
            sum(paragraph_word_counts) / len(paragraph_word_counts)
            if paragraph_word_counts
            else 0.0
        )

        # Vocabulary diversity
        unique_words = set(words_lower)
        vocabulary_diversity = len(unique_words) / total_words if total_words > 0 else 0.0

        # Structural elements
        heading_count = self._count_headings(text)
        table_count = self._count_tables(text)
        code_block_count = self._count_code_blocks(text)
        list_count = self._count_lists(text)

        has_complex_structure = (table_count + heading_count) > 5

        # Content density: chars per paragraph
        content_density = total_chars / total_paragraphs if total_paragraphs > 0 else 0.0

        # Repetition score via 5-gram shingling
        repetition_score = self._compute_repetition_score(words_lower, n=5)

        # Language complexity
        language_complexity = self._assess_language_complexity(
            avg_sentence_length, vocabulary_diversity
        )

        # Topic extraction
        top_topics = self._extract_topics(words_lower, top_n=10)

        return DocumentProfile(
            doc_type=doc_type,
            total_chars=total_chars,
            total_words=total_words,
            total_sentences=total_sentences,
            total_paragraphs=total_paragraphs,
            avg_sentence_length=round(avg_sentence_length, 2),
            avg_paragraph_length=round(avg_paragraph_length, 2),
            vocabulary_diversity=round(vocabulary_diversity, 4),
            heading_count=heading_count,
            table_count=table_count,
            code_block_count=code_block_count,
            list_count=list_count,
            has_complex_structure=has_complex_structure,
            content_density=round(content_density, 2),
            repetition_score=round(repetition_score, 4),
            language_complexity=language_complexity,
            top_topics=top_topics,
        )

    def _classify_text(self, text: str) -> str:
        """
        Classify document type using the existing document_analyzer's quick classification.
        Falls back to 'general' if classification is inconclusive.
        """
        analyzer = self._get_analyzer()
        result = analyzer._quick_classify(text)
        if result is not None:
            doc_type, _confidence = result
            return doc_type

        # Extended keyword-based classification for types the analyzer doesn't cover
        text_lower = text.lower()

        # Medical detection
        medical_keywords = [
            "diagnosis", "patient", "clinical", "treatment", "symptoms",
            "medication", "dosage", "prognosis", "pathology", "therapy",
        ]
        if sum(1 for kw in medical_keywords if kw in text_lower) >= 3:
            return "medical"

        # Code detection
        code_patterns = [
            r"\bdef\s+\w+\(", r"\bfunction\s+\w+\(", r"\bclass\s+\w+[:\{]",
            r"\bimport\s+\w+", r"\breturn\s+", r"console\.log\(",
        ]
        if sum(1 for p in code_patterns if re.search(p, text)) >= 2:
            return "code"

        # Academic detection
        academic_keywords = [
            "abstract", "methodology", "hypothesis", "findings", "literature review",
            "et al", "citation", "peer review", "bibliography", "conclusion",
        ]
        if sum(1 for kw in academic_keywords if kw in text_lower) >= 3:
            return "academic"

        return "general"

    def _count_headings(self, text: str) -> int:
        """Count heading-like lines (markdown-style or ALL-CAPS lines)."""
        count = 0
        for line in text.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            # Markdown headings
            if re.match(r"^#{1,6}\s+", stripped):
                count += 1
            # ALL-CAPS lines that look like headings (3-80 chars, no lowercase)
            elif (
                3 <= len(stripped) <= 80
                and stripped.isupper()
                and re.match(r"^[A-Z][A-Z\s\d.:\-]+$", stripped)
            ):
                count += 1
        return count

    def _count_tables(self, text: str) -> int:
        """Count table-like structures (markdown tables or tab-separated data)."""
        # Markdown tables: lines with | separators
        table_lines = re.findall(r"^.*\|.*\|.*$", text, re.MULTILINE)
        # Group consecutive table lines as one table
        if not table_lines:
            return 0
        count = 0
        in_table = False
        for line in text.split("\n"):
            is_table_line = "|" in line and line.count("|") >= 2
            if is_table_line and not in_table:
                count += 1
                in_table = True
            elif not is_table_line:
                in_table = False
        return count

    def _count_code_blocks(self, text: str) -> int:
        """Count fenced code blocks (``` markers) or indented code blocks."""
        # Fenced code blocks
        fenced = len(re.findall(r"```", text)) // 2
        # Indented blocks: 4+ consecutive lines starting with 4+ spaces
        indented = 0
        consecutive = 0
        for line in text.split("\n"):
            if re.match(r"^ {4,}\S", line):
                consecutive += 1
            else:
                if consecutive >= 4:
                    indented += 1
                consecutive = 0
        if consecutive >= 4:
            indented += 1
        return fenced + indented

    def _count_lists(self, text: str) -> int:
        """Count list structures (bulleted or numbered)."""
        list_items = re.findall(
            r"^\s*(?:[-*+]|\d+[.)]) ", text, re.MULTILINE
        )
        # Group consecutive list items as one list
        if not list_items:
            return 0
        count = 0
        in_list = False
        for line in text.split("\n"):
            is_list_item = bool(re.match(r"^\s*(?:[-*+]|\d+[.)]) ", line))
            if is_list_item and not in_list:
                count += 1
                in_list = True
            elif not is_list_item and line.strip():
                in_list = False
        return count

    def _compute_repetition_score(self, words: list[str], n: int = 5) -> float:
        """
        Compute repetition score using n-gram shingling.
        Returns ratio of duplicate shingles to total shingles (0-1).
        """
        if len(words) < n:
            return 0.0

        shingles = []
        for i in range(len(words) - n + 1):
            shingle = tuple(words[i : i + n])
            shingles.append(shingle)

        total = len(shingles)
        unique = len(set(shingles))

        if total == 0:
            return 0.0

        # Ratio of duplicates: (total - unique) / total
        return (total - unique) / total

    def _assess_language_complexity(
        self, avg_sentence_length: float, vocabulary_diversity: float
    ) -> str:
        """Determine language complexity based on avg sentence length."""
        if avg_sentence_length < 15:
            return "simple"
        elif avg_sentence_length <= 25:
            return "moderate"
        else:
            return "complex"

    def _extract_topics(self, words_lower: list[str], top_n: int = 10) -> list[str]:
        """
        Extract top topics using simple frequency counting of non-stopword words.
        Filters for words that are likely meaningful (length >= 4, not purely numeric).
        """
        meaningful = [
            w
            for w in words_lower
            if w not in STOP_WORDS and len(w) >= 4 and not w.isdigit()
        ]
        counter = Counter(meaningful)
        return [word for word, _count in counter.most_common(top_n)]


# Singleton
document_profiler = DocumentProfiler()
