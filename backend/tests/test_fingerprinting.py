"""
Tests for expanded corpus fingerprinting signals.
Verifies that document_analyzer._compute_content_signals() correctly detects
all 20 structural signals from document text.
"""
import pytest

from app.services.document_analyzer import document_analyzer


# ── Helpers ─────────────────────────────────────────────────────────────

def signals(text: str) -> dict:
    """Shortcut to compute content signals from raw text."""
    return document_analyzer._compute_content_signals(text)


# ── Original 9 signals ─────────────────────────────────────────────────

class TestOriginalSignals:
    def test_heading_density_markdown(self):
        text = "# Title\n\nSome paragraph.\n\n## Section\n\nMore text.\n"
        s = signals(text)
        assert s["heading_density"] > 0

    def test_code_ratio(self):
        text = "def foo():\n    return 42\n\nclass Bar:\n    pass\n\nimport os\n"
        s = signals(text)
        assert s["code_ratio"] > 0.3

    def test_table_ratio(self):
        text = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |\nSome text.\n"
        s = signals(text)
        assert s["table_ratio"] > 0.5

    def test_list_ratio(self):
        text = "- item 1\n- item 2\n- item 3\n1. numbered\n2. numbered\ntext\n"
        s = signals(text)
        assert s["list_ratio"] > 0.5

    def test_avg_sentence_length(self):
        text = "This is a short sentence. Another short one."
        s = signals(text)
        assert 3 < s["avg_sentence_length"] < 10

    def test_avg_paragraph_sentences(self):
        text = "First sentence. Second sentence.\n\nThird sentence."
        s = signals(text)
        assert s["avg_paragraph_sentences"] > 0

    def test_totals(self):
        text = "Hello world. This is a test."
        s = signals(text)
        assert s["total_words"] > 0
        assert s["total_lines"] > 0
        assert s["total_paragraphs"] > 0


# ── New expanded signals ───────────────────────────────────────────────

class TestFormulaRatio:
    def test_latex_dollar_sign(self):
        text = "The equation $E = mc^2$ is famous.\nNormal text here.\n"
        s = signals(text)
        assert s["formula_ratio"] > 0

    def test_latex_commands(self):
        text = "We compute \\frac{a}{b} and \\int_0^1 f(x) dx.\nPlain text.\n"
        s = signals(text)
        assert s["formula_ratio"] > 0

    def test_no_formulas(self):
        text = "This is plain text with no math at all.\nJust regular sentences.\n"
        s = signals(text)
        assert s["formula_ratio"] == 0


class TestCrossRefRatio:
    def test_section_references(self):
        text = "As mentioned in the previous section, this is important.\nSee section 3.2 for details.\nPlain text.\n"
        s = signals(text)
        assert s["cross_ref_ratio"] > 0

    def test_no_references(self):
        text = "The sky is blue. Water is wet. Fire is hot.\n"
        s = signals(text)
        assert s["cross_ref_ratio"] == 0


class TestNamedEntityDensity:
    def test_capitalized_phrases(self):
        text = "Isaac Newton discovered gravity. Albert Einstein proposed relativity. The United States of America is large.\n"
        s = signals(text)
        assert s["named_entity_density"] > 0

    def test_no_entities(self):
        text = "the quick brown fox jumps over the lazy dog.\n"
        s = signals(text)
        assert s["named_entity_density"] == 0


class TestQuestionDensity:
    def test_questions(self):
        text = "What is gravity?\nHow does it work?\nWhy does it matter?\nIt just does.\n"
        s = signals(text)
        assert s["question_density"] >= 0.5

    def test_no_questions(self):
        text = "This is a statement. So is this. And this too.\n"
        s = signals(text)
        assert s["question_density"] == 0


class TestDialogueRatio:
    def test_quoted_dialogue(self):
        text = '"Hello," said Alice.\n"Hi there," Bob replied.\nNarration continues.\n'
        s = signals(text)
        assert s["dialogue_ratio"] > 0

    def test_qa_format(self):
        text = "Q: What is the answer?\nA: The answer is 42.\nQ: Why?\nA: Because.\n"
        s = signals(text)
        assert s["dialogue_ratio"] > 0


class TestHeadingDepth:
    def test_markdown_depth(self):
        text = "# Title\n## Section\n### Subsection\n#### Deep\nText.\n"
        s = signals(text)
        assert s["heading_depth"] >= 4

    def test_no_headings(self):
        text = "Just plain text with no headings at all.\n"
        s = signals(text)
        assert s["heading_depth"] == 0


class TestForwardBackReferences:
    def test_forward_references(self):
        text = "We will see in the next section how this works.\nLater in this chapter we discuss.\nPlain text.\n"
        s = signals(text)
        assert s["forward_references"] > 0

    def test_back_references(self):
        text = "As mentioned earlier, this is key.\nRecall that we defined X previously.\nPlain text.\n"
        s = signals(text)
        assert s["back_references"] > 0


class TestComparisonPatterns:
    def test_comparisons(self):
        text = "Method A vs Method B showed different results.\nUnlike the previous approach, this one is better.\nCompared to X, Y performs well.\n"
        s = signals(text)
        assert s["comparison_patterns"] > 0

    def test_no_comparisons(self):
        text = "This is a simple paragraph. Nothing to compare here.\n"
        s = signals(text)
        assert s["comparison_patterns"] == 0


class TestCausalChains:
    def test_causal_language(self):
        text = "Because of gravity, objects fall. Therefore we can predict trajectories. This leads to practical applications.\n"
        s = signals(text)
        assert s["causal_chains"] > 0


class TestVocabularyDiversity:
    def test_high_diversity(self):
        text = "Each word here is unique and different from every other token present."
        s = signals(text)
        assert s["vocabulary_diversity"] > 0.5

    def test_low_diversity(self):
        text = "the the the the the the the the a a a a a a a a"
        s = signals(text)
        assert s["vocabulary_diversity"] < 0.3


# ── Integration: document type scenarios ───────────────────────────────

class TestDocumentTypeScenarios:
    """Test that signal combinations match expected document types."""

    def test_code_document(self):
        text = """import os
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    if not os.path.exists(args.input):
        sys.exit(1)

    with open(args.input) as f:
        data = json.load(f)

    for item in data:
        process(item)

class Processor:
    def __init__(self):
        self.count = 0

    def process(self, item):
        self.count += 1
        return item
"""
        s = signals(text)
        assert s["code_ratio"] > 0.3
        assert s["heading_density"] < 0.05
        assert s["question_density"] == 0

    def test_educational_textbook(self):
        text = """# Chapter 1: Newton's Laws of Motion

## 1.1 Introduction to Forces

Newton's First Law states that an object at rest stays at rest. As we will see in the next section, this has important implications.

## 1.2 The Three Laws

### First Law
An object in motion stays in motion unless acted upon by a force.
Because of inertia, objects resist changes to their state of motion.
Therefore, a force is required to change velocity.

### Second Law
The acceleration of an object is directly proportional to the net force.
The equation $F = ma$ is fundamental to mechanics.

### Third Law
For every action, there is an equal and opposite reaction.
As mentioned in section 1.1, forces come in pairs.

## 1.3 Practice Problems

What is the net force on a 5kg object accelerating at 2 m/s²?
How does Newton's Third Law apply to rocket propulsion?
Compare the effects of friction vs air resistance on a moving car.
"""
        s = signals(text)
        assert s["heading_depth"] >= 3
        assert s["heading_density"] > 0.03
        assert s["formula_ratio"] > 0
        assert s["question_density"] > 0
        assert s["cross_ref_ratio"] > 0
        assert s["forward_references"] > 0
        assert s["back_references"] > 0
        assert s["causal_chains"] > 0

    def test_legal_document(self):
        text = """CONFIDENTIALITY AGREEMENT

THIS AGREEMENT is entered into as of the date set forth below.

WHEREAS the Disclosing Party possesses confidential information.
WHEREAS the Receiving Party desires to receive such information.

1. DEFINITIONS
Confidential Information means all non-public information disclosed by either party.
As defined herein, the term includes all technical and business information.

2. OBLIGATIONS
The Receiving Party shall not disclose Confidential Information to third parties.
Subject to Section 3 below, the obligations shall continue for five years.

3. EXCEPTIONS
The obligations in Section 2 shall not apply to information that was previously known.
"""
        s = signals(text)
        assert s["avg_sentence_length"] > 5  # legal clauses split by periods
        assert s["cross_ref_ratio"] > 0  # "Subject to Section 3"

    def test_faq_document(self):
        text = """Q: How do I reset my password?
A: Go to Settings and click Reset Password.

Q: What payment methods do you accept?
A: We accept credit cards, PayPal, and bank transfers.

Q: Can I cancel my subscription?
A: Yes, you can cancel anytime from your account page.

Q: How long does shipping take?
A: Standard shipping takes 5-7 business days.

Q: Do you offer refunds?
A: Yes, within 30 days of purchase.
"""
        s = signals(text)
        assert s["question_density"] > 0.3
        assert s["dialogue_ratio"] > 0.5
