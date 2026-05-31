import os
import re
import json
import pickle
import logging
import hashlib
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# LangChain
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.retrievers import BM25Retriever
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document

# Vectorless RAG components
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ──────────────────────────────────────────────────────
#  CONFIG
# ──────────────────────────────────────────────────────

PDF_FILE = "gita_english.pdf"
TXT_FILE = "bhagwatgita.txt"
PORT = int(os.getenv("PORT", 8000))

CACHE_DIR = Path("cache")
CHUNKS_CACHE = CACHE_DIR / "chunks_cache.json"
BM25_CACHE = CACHE_DIR / "bm25.pkl"
TFIDF_VEC_CACHE = CACHE_DIR / "tfidf_vectorizer.pkl"
TFIDF_MAT_CACHE = CACHE_DIR / "tfidf_matrix.npz"
VERSE_CACHE = CACHE_DIR / "verse_lookup.json"
SRC_HASH_CACHE = CACHE_DIR / "source_hash.txt"

LLM_MODEL = "llama-3.3-70b-versatile"

# ── Exact verse counts per chapter ────────────────────
GITA_VERSE_COUNTS: dict = {
    1: 47, 2: 72, 3: 43, 4: 42, 5: 29,
    6: 47, 7: 30, 8: 28, 9: 34, 10: 42,
    11: 55, 12: 20, 13: 35, 14: 27, 15: 20,
    16: 24, 17: 28, 18: 78,
}

# ── Supported response languages ─────────────────────
SUPPORTED_LANGUAGES = {"English", "Gujarati", "Hindi"}

LANGUAGE_ALIASES = {
    "english": "English",
    "eng": "English",
    "en": "English",

    "gujarati": "Gujarati",
    "guj": "Gujarati",
    "gu": "Gujarati",

    "hindi": "Hindi",
    "hin": "Hindi",
    "hi": "Hindi",
}


def normalize_language(language: str) -> str:
    """
    Normalize frontend language values.
    Accepts: English, Gujarati, Hindi, ENG, GUJ, HIN, en, gu, hi.
    Defaults to English if unknown.
    """
    if not language:
        return "English"

    lang = LANGUAGE_ALIASES.get(language.strip().lower())

    if lang in SUPPORTED_LANGUAGES:
        return lang

    return "English"


def language_rule(language: str) -> str:
    """
    Stronger language instruction for the LLM.
    """
    language = normalize_language(language)

    if language == "Hindi":
        return (
            "Write the full answer in natural Hindi using Devanagari script. "
            "Do not write Hinglish. Do not mix English except unavoidable terms "
            "like Bhagavad Gita, Krishna, Arjuna, Dharma, Karma, Moksha."
        )

    if language == "Gujarati":
        return (
            "Write the full answer in natural Gujarati using Gujarati script. "
            "Do not write English or Hinglish except unavoidable terms like "
            "Bhagavad Gita, Krishna, Arjuna, Dharma, Karma, Moksha."
        )

    return "Write the full answer in clear, simple English."


# ── Kruti Dev extended-Latin characters ───────────────
_KRUTI_CHARS = set(
    "²³§¨©ª«¬\xad®¯°±µ¶·¸¹º»¼½¾¿"
    "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ"
    "ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîï"
    "ðñòóôõöøùúûüýþÿŸ"
)
_GARBLED_THRESHOLD = 0.03

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────
#  FASTAPI APP
# ──────────────────────────────────────────────────────

app = FastAPI(
    title="Bhagavad Gita – Vectorless RAG",
    description="BM25 + TF-IDF + RRF + TF-IDF rerank. No FAISS, no dense embeddings.",
    version="4.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class Query(BaseModel):
    question: str
    language: str = "English"
    top_k: int = 5
    history: List[ChatMessage] = []


# ──────────────────────────────────────────────────────
#  GARBLED-TEXT HELPERS
# ──────────────────────────────────────────────────────

def _garbled_ratio(text: str) -> float:
    if not text:
        return 1.0
    return sum(1 for c in text if c in _KRUTI_CHARS) / len(text)


def _is_garbled(text: str) -> bool:
    return _garbled_ratio(text) > _GARBLED_THRESHOLD


def _clean_response(text: str) -> str:
    """
    Remove any line from the LLM response that contains garbled Kruti Dev text.
    """
    good_lines = [
        ln for ln in text.split("\n")
        if _garbled_ratio(ln) <= _GARBLED_THRESHOLD
    ]
    return "\n".join(good_lines).strip()


def _filter_clean_docs(docs: List[Document]) -> List[Document]:
    return [d for d in docs if not _is_garbled(d.page_content)]


# ──────────────────────────────────────────────────────
#  VERSE VALIDATION HELPERS
# ──────────────────────────────────────────────────────

def _valid_gita_ref(chapter: int, verse: int) -> bool:
    max_verse = GITA_VERSE_COUNTS.get(chapter)
    return max_verse is not None and 1 <= verse <= max_verse


def _invalid_ref_message(chapter: int, verse: int, language: str = "English") -> str:
    """
    Human-friendly rejection message when the user asks for a non-existent verse.
    Returned in selected language.
    """
    language = normalize_language(language)

    if chapter not in GITA_VERSE_COUNTS:
        if language == "Hindi":
            return (
                f"⚠️ अमान्य श्लोक संदर्भ मिला।\n\n"
                f"भगवद गीता में अध्याय {chapter} मौजूद नहीं है।\n\n"
                f"भगवद गीता में:\n"
                f"• कुल 18 अध्याय हैं\n"
                f"• कुल 700 श्लोक हैं\n\n"
                f"कृपया अध्याय संख्या जाँचें। मान्य अध्याय 1 से 18 तक हैं।\n"
                f"उदाहरण: Chapter 2 verse 47 या BG 18.66 🕉️"
            )

        if language == "Gujarati":
            return (
                f"⚠️ અમાન્ય શ્લોક સંદર્ભ મળ્યો છે.\n\n"
                f"ભગવદ ગીતામાં અધ્યાય {chapter} નથી.\n\n"
                f"ભગવદ ગીતામાં:\n"
                f"• કુલ 18 અધ્યાય છે\n"
                f"• કુલ 700 શ્લોક છે\n\n"
                f"કૃપા કરીને અધ્યાય નંબર તપાસો. માન્ય અધ્યાય 1 થી 18 સુધી છે.\n"
                f"ઉદાહરણ: Chapter 2 verse 47 અથવા BG 18.66 🕉️"
            )

        return (
            f"⚠️ Invalid verse reference detected.\n\n"
            f"Chapter {chapter} does not exist in the Bhagavad Gita.\n\n"
            f"The Bhagavad Gita contains:\n"
            f"• 18 chapters\n"
            f"• 700 verses in total\n\n"
            f"Please check the chapter number. Valid chapters are 1 through 18.\n"
            f"Example: Chapter 2 verse 47 or BG 18.66 🕉️"
        )

    max_v = GITA_VERSE_COUNTS[chapter]

    if language == "Hindi":
        return (
            f"⚠️ अमान्य श्लोक संदर्भ मिला।\n\n"
            f"भगवद गीता के अध्याय {chapter} में केवल {max_v} श्लोक हैं "
            f"(श्लोक 1 से {max_v} तक)।\n"
            f"श्लोक {verse} इस अध्याय में मौजूद नहीं है।\n\n"
            f"भगवद गीता में:\n"
            f"• कुल 18 अध्याय हैं\n"
            f"• कुल 700 श्लोक हैं\n\n"
            f"कृपया श्लोक संख्या जाँचकर फिर प्रयास करें।\n"
            f"उदाहरण: Chapter {chapter} verse 1 से Chapter {chapter} verse {max_v} तक 🕉️"
        )

    if language == "Gujarati":
        return (
            f"⚠️ અમાન્ય શ્લોક સંદર્ભ મળ્યો છે.\n\n"
            f"ભગવદ ગીતાના અધ્યાય {chapter} માં માત્ર {max_v} શ્લોક છે "
            f"(શ્લોક 1 થી {max_v} સુધી).\n"
            f"શ્લોક {verse} આ અધ્યાયમાં નથી.\n\n"
            f"ભગવદ ગીતામાં:\n"
            f"• કુલ 18 અધ્યાય છે\n"
            f"• કુલ 700 શ્લોક છે\n\n"
            f"કૃપા કરીને શ્લોક નંબર તપાસીને ફરી પ્રયાસ કરો.\n"
            f"ઉદાહરણ: Chapter {chapter} verse 1 થી Chapter {chapter} verse {max_v} સુધી 🕉️"
        )

    return (
        f"⚠️ Invalid verse reference detected.\n\n"
        f"Chapter {chapter} of the Bhagavad Gita has only {max_v} verses "
        f"(verse 1 to {max_v}).\n"
        f"Verse {verse} does not exist in this chapter.\n\n"
        f"The Bhagavad Gita contains:\n"
        f"• 18 chapters\n"
        f"• 700 verses in total\n\n"
        f"Please check the verse number and try again.\n"
        f"Example: Chapter {chapter} verse 1 through Chapter {chapter} verse {max_v} 🕉️"
    )


# ──────────────────────────────────────────────────────
#  VECTORLESS RAG ENGINE
# ──────────────────────────────────────────────────────

class VectorlessGitaRAG:
    """
    Full pipeline:
      1. Topic guard
      2. Verse detection + validation
      3. BM25 sparse retrieval
      4. TF-IDF sparse retrieval
      5. RRF fusion
      6. TF-IDF similarity reranking
      7. LLM answer generation
    """

    def __init__(self):
        self.documents: List[Document] = []
        self.verse_lookup: dict = {}
        self.bm25: Optional[BM25Retriever] = None
        self.tfidf: Optional[TfidfVectorizer] = None
        self.tfidf_matrix = None
        self.doc_texts: List[str] = []
        self.llm = ChatGroq(model_name=LLM_MODEL, temperature=0)

    # ── source hash ───────────────────────────────────

    @staticmethod
    def _source_hash() -> str:
        h = hashlib.md5()
        for p in (PDF_FILE, TXT_FILE):
            if os.path.exists(p):
                with open(p, "rb") as f:
                    h.update(f.read())
        return h.hexdigest()

    def _cache_valid(self) -> bool:
        required = [
            CHUNKS_CACHE,
            BM25_CACHE,
            TFIDF_VEC_CACHE,
            TFIDF_MAT_CACHE,
            VERSE_CACHE,
            SRC_HASH_CACHE,
        ]

        if not all(p.exists() for p in required):
            return False

        return SRC_HASH_CACHE.read_text().strip() == self._source_hash()

    # ── document loading ──────────────────────────────

    def _read_txt_safe(self) -> str:
        for enc in ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]:
            try:
                raw = Path(TXT_FILE).read_text(encoding=enc)

                if not _is_garbled(raw[:2000]):
                    logger.info(f"TXT read OK with encoding={enc}")
                    return raw

                logger.warning(f"Encoding {enc} produced garbled text, trying next.")
            except (UnicodeDecodeError, LookupError):
                continue

        raise RuntimeError(
            f"{TXT_FILE} could not be decoded cleanly. "
            "It is likely in Kruti Dev font encoding. "
            "Convert it to UTF-8 before using it."
        )

    def _load_documents(self) -> List[Document]:
        if not os.path.exists(PDF_FILE):
            raise FileNotFoundError(f"{PDF_FILE} not found")

        logger.info("Loading English PDF.")
        pdf_docs = PyPDFLoader(PDF_FILE).load()

        for d in pdf_docs:
            d.metadata["source_type"] = "english"

        san_docs: List[Document] = []
        skipped = 0

        if os.path.exists(TXT_FILE):
            logger.info("Parsing Sanskrit TXT.")

            try:
                raw = self._read_txt_safe()
                pattern = r"(.*?)((?:॥|\|\|)\s*(\d+)[\-\.](\d+)\s*(?:॥|\|\|))"

                for content, marker, ch, vs in re.findall(pattern, raw, re.DOTALL):
                    ch, vs = int(ch), int(vs)
                    txt = content.strip() + " " + marker.strip()

                    if _is_garbled(txt):
                        skipped += 1
                        continue

                    self.verse_lookup[(ch, vs)] = txt

                    san_docs.append(
                        Document(
                            page_content=txt,
                            metadata={
                                "source_type": "sanskrit",
                                "chapter": ch,
                                "verse": vs,
                            },
                        )
                    )

                logger.info(f"Parsed {len(san_docs)} Sanskrit shlokas. Skipped {skipped} garbled shlokas.")

                if skipped and not san_docs:
                    logger.warning("All Sanskrit verses were garbled. Only English PDF will be used.")

            except Exception as e:
                logger.warning(f"Could not parse TXT: {e}. Continuing with PDF only.")
        else:
            logger.warning(f"{TXT_FILE} not found. Using English PDF only.")

        return pdf_docs + san_docs

    # ── cache build/load ──────────────────────────────

    def _build_and_cache(self):
        CACHE_DIR.mkdir(exist_ok=True)

        raw_docs = self._load_documents()

        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)

        english = [
            d for d in raw_docs
            if d.metadata["source_type"] == "english"
        ]

        sanskrit = [
            d for d in raw_docs
            if d.metadata["source_type"] == "sanskrit"
        ]

        all_chunks = [
            c for c in splitter.split_documents(english)
            if not _is_garbled(c.page_content)
        ]

        all_chunks += sanskrit

        logger.info(f"Total clean chunks: {len(all_chunks)}")

        CHUNKS_CACHE.write_text(
            json.dumps(
                [{"text": d.page_content, "meta": d.metadata} for d in all_chunks],
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        logger.info("Fitting BM25.")
        bm25 = BM25Retriever.from_documents(all_chunks)
        bm25.k = 20

        with open(BM25_CACHE, "wb") as f:
            pickle.dump(bm25, f)

        logger.info("Fitting TF-IDF.")
        texts = [d.page_content for d in all_chunks]

        tfidf = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            max_features=50_000,
            sublinear_tf=True,
        )

        matrix = tfidf.fit_transform(texts)

        with open(TFIDF_VEC_CACHE, "wb") as f:
            pickle.dump(tfidf, f)

        np.savez_compressed(
            str(TFIDF_MAT_CACHE),
            data=matrix.data,
            indices=matrix.indices,
            indptr=matrix.indptr,
            shape=matrix.shape,
        )

        verse_serial = {
            f"{ch}-{vs}": txt
            for (ch, vs), txt in self.verse_lookup.items()
        }

        VERSE_CACHE.write_text(
            json.dumps(verse_serial, ensure_ascii=False),
            encoding="utf-8",
        )

        SRC_HASH_CACHE.write_text(self._source_hash())

        logger.info("Cache built successfully.")

        return all_chunks, bm25, tfidf, matrix, texts

    def _load_from_cache(self):
        logger.info("Loading indices from cache.")

        data = json.loads(CHUNKS_CACHE.read_text(encoding="utf-8"))

        chunks = [
            Document(page_content=i["text"], metadata=i["meta"])
            for i in data
        ]

        chunks = _filter_clean_docs(chunks)

        with open(BM25_CACHE, "rb") as f:
            bm25 = pickle.load(f)

        bm25.k = 20

        with open(TFIDF_VEC_CACHE, "rb") as f:
            tfidf = pickle.load(f)

        npz = np.load(str(TFIDF_MAT_CACHE), allow_pickle=False)

        from scipy.sparse import csr_matrix

        matrix = csr_matrix(
            (npz["data"], npz["indices"], npz["indptr"]),
            shape=tuple(npz["shape"]),
        )

        verse_raw = json.loads(VERSE_CACHE.read_text(encoding="utf-8"))

        self.verse_lookup = {
            tuple(int(x) for x in k.split("-")): v
            for k, v in verse_raw.items()
            if not _is_garbled(v)
        }

        texts = [d.page_content for d in chunks]

        logger.info(f"Cache loaded: {len(chunks)} chunks, {len(self.verse_lookup)} verses.")

        return chunks, bm25, tfidf, matrix, texts

    def _attach_index(self, chunks, bm25, tfidf, matrix, texts):
        self.documents = chunks
        self.bm25 = bm25
        self.tfidf = tfidf
        self.tfidf_matrix = matrix
        self.doc_texts = texts

        logger.info("Vectorless index ready.")

    def initialize(self):
        if self._cache_valid():
            data = self._load_from_cache()
        else:
            logger.info("Cache missing or stale. Rebuilding.")
            data = self._build_and_cache()

        self._attach_index(*data)

    # ── retrieval ─────────────────────────────────────

    def _bm25_retrieve(self, query: str, k: int) -> List[Tuple[Document, int]]:
        self.bm25.k = k
        results = self.bm25.invoke(query)
        clean = _filter_clean_docs(results)

        return [(doc, rank) for rank, doc in enumerate(clean)]

    def _tfidf_retrieve(self, query: str, k: int) -> List[Tuple[Document, int]]:
        q_vec = self.tfidf.transform([query])
        scores = cosine_similarity(q_vec, self.tfidf_matrix).flatten()
        top_idx = np.argsort(scores)[::-1][:k * 2]

        results = _filter_clean_docs([
            self.documents[i]
            for i in top_idx
        ])

        return [(doc, rank) for rank, doc in enumerate(results[:k])]

    def _rrf_fuse(self, bm25_ranked, tfidf_ranked, k_rrf=60) -> List[Document]:
        scores: dict = {}
        doc_map: dict = {}

        for doc, rank in bm25_ranked + tfidf_ranked:
            key = doc.page_content
            scores[key] = scores.get(key, 0.0) + 1.0 / (k_rrf + rank + 1)
            doc_map[key] = doc

        fused = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)

        return [doc_map[k] for k in fused]

    def _tfidf_rerank(
        self,
        query: str,
        docs: List[Document],
        top_k: int,
        min_similarity: float = 0.05,
    ) -> List[Document]:
        if not docs:
            return []

        texts = [d.page_content for d in docs]

        q_vec = self.tfidf.transform([query])
        d_vecs = self.tfidf.transform(texts)

        sims = cosine_similarity(q_vec, d_vecs).flatten()
        top_idx = np.argsort(sims)[::-1]

        reranked = []

        for i in top_idx:
            if len(reranked) >= top_k:
                break

            if sims[i] >= min_similarity:
                docs[i].metadata["relevance_score"] = float(sims[i])
                reranked.append(docs[i])

        return reranked

    def hybrid_retrieve(self, query: str, top_k: int = 5) -> List[Document]:
        logger.info(f"[Retrieval] query={query!r}, top_k={top_k}")

        bm25_res = self._bm25_retrieve(query, k=30)
        tfidf_res = self._tfidf_retrieve(query, k=30)

        fused = self._rrf_fuse(bm25_res, tfidf_res)
        clean = _filter_clean_docs(fused[:top_k * 2])
        reranked = self._tfidf_rerank(query, clean, top_k=top_k)

        logger.info(f"[Retrieval] final context passages: {len(reranked)}")

        return reranked

    # ── query expansion ───────────────────────────────

    @staticmethod
    def _expand_query(question: str) -> List[str]:
        q = question.strip()
        expansions = [q]

        concept_map = {
            "moksha": ["moksha liberation gita", "moksha meaning bhagavad gita"],
            "karma": ["karma yoga action gita", "karma meaning bhagavad gita"],
            "dharma": ["dharma duty righteousness gita", "dharma meaning bhagavad gita"],
            "yoga": ["yoga path gita", "yoga types bhagavad gita"],
            "atman": ["atman soul self gita", "atman brahman relationship"],
            "brahman": ["brahman absolute truth gita", "brahman cosmic consciousness"],
            "bhakti": ["bhakti devotion yoga gita", "bhakti path to liberation"],
            "jnana": ["jnana knowledge yoga gita", "jnana wisdom path"],
            "samsara": ["samsara cycle rebirth gita", "samsara liberation moksha"],
            "detachment": ["detachment action result gita", "nishkama karma"],
            "meditation": ["meditation mind control gita", "dhyana yoga"],
            "liberation": ["liberation moksha gita", "liberation soul self"],
            "reincarnation": ["reincarnation soul rebirth gita", "cycle of birth death"],
            "surrender": ["surrender to god krishna gita", "sharanagati devotion"],
            "gunas": ["three gunas sattva rajas tamas", "gunas nature prakriti"],
        }

        q_lower = q.lower()

        for concept, extras in concept_map.items():
            if concept in q_lower:
                expansions.extend(extras)
                break

        return expansions[:3]

    def hybrid_retrieve_expanded(self, question: str, top_k: int = 5) -> List[Document]:
        queries = self._expand_query(question)

        logger.info(f"[Expansion] queries={queries}")

        all_bm25: List[Tuple[Document, int]] = []
        all_tfidf: List[Tuple[Document, int]] = []

        for q in queries:
            all_bm25.extend(self._bm25_retrieve(q, k=20))
            all_tfidf.extend(self._tfidf_retrieve(q, k=20))

        fused = self._rrf_fuse(all_bm25, all_tfidf)
        clean = _filter_clean_docs(fused[:top_k * 3])
        reranked = self._tfidf_rerank(question, clean, top_k=top_k)

        logger.info(f"[Expansion] final context passages: {len(reranked)}")

        return reranked

    # ── verse-specific retrieval ──────────────────────

    def _verse_targeted_retrieve(self, chapter: int, verse: int) -> List[Document]:
        logger.info(f"[VerseRetrieval] targeting BG {chapter}.{verse}")

        queries = [
            f"chapter {chapter} verse {verse}",
            f"chapter {chapter} shloka {verse}",
            f"{chapter}.{verse}",
            f"bhagavad gita {chapter} {verse}",
        ]

        candidate_map: dict = {}
        rank_scores: dict = {}
        k_rrf = 60

        for q in queries:
            combined = self._bm25_retrieve(q, k=15) + self._tfidf_retrieve(q, k=15)

            for doc, rank in combined:
                key = doc.page_content[:120]
                candidate_map[key] = doc
                rank_scores[key] = rank_scores.get(key, 0.0) + 1.0 / (k_rrf + rank + 1)

        fused = sorted(candidate_map.keys(), key=lambda k: rank_scores[k], reverse=True)
        candidates = [candidate_map[k] for k in fused[:30]]

        ch_s = str(chapter)
        vs_s = str(verse)

        def _boost(doc: Document) -> float:
            t = doc.page_content.lower()
            b = rank_scores.get(doc.page_content[:120], 0.0)

            if ch_s in t:
                b += 0.5

            if vs_s in t:
                b += 0.5

            if f"{ch_s}.{vs_s}" in t or f"{ch_s}-{vs_s}" in t:
                b += 1.0

            return b

        candidates.sort(key=_boost, reverse=True)

        top10 = _filter_clean_docs(candidates[:10])

        primary_q = f"chapter {chapter} verse {verse} bhagavad gita"

        reranked = self._tfidf_rerank(
            primary_q,
            top10,
            top_k=5,
            min_similarity=0.01,
        )

        logger.info(f"[VerseRetrieval] final passages: {len(reranked)}")

        return reranked

    # ── context formatting ────────────────────────────

    def _format_context(self, docs: List[Document]) -> str:
        clean = _filter_clean_docs(docs)
        parts = []

        for i, d in enumerate(clean, 1):
            src = d.metadata.get("source_type", "").capitalize()
            ch = d.metadata.get("chapter", "")
            vs = d.metadata.get("verse", "")
            sc = d.metadata.get("relevance_score", 0.0)

            tag = f"[{src}"

            if ch and vs:
                tag += f" {ch}.{vs}"

            tag += f" | Confidence: {sc:.2f}]"

            parts.append(f"{i}. {tag}\n{d.page_content.strip()}")

        return "\n\n".join(parts) if parts else "(No relevant passages found.)"

    # ── history formatting ────────────────────────────

    @staticmethod
    def _format_history(history: list) -> str:
        if not history:
            return "(This is the start of the conversation.)"

        lines = []

        for m in history[-6:]:
            speaker = "Learner" if m.role == "user" else "Guide"
            lines.append(f"{speaker}: {m.content.strip()}")

        return "\n".join(lines)

    # ── answer generation: verse ──────────────────────

    def _ask_verse(
        self,
        chapter: int,
        verse: int,
        question: str,
        history: list,
        language: str,
    ) -> str:
        language = normalize_language(language)
        lang_rule = language_rule(language)

        history_text = self._format_history(history)

        raw_skt = self.verse_lookup.get((chapter, verse))
        sanskrit_ok = bool(raw_skt and not _is_garbled(raw_skt))

        logger.info(f"[AskVerse] BG {chapter}.{verse}, sanskrit_ok={sanskrit_ok}")

        targeted = self._verse_targeted_retrieve(chapter, verse)

        if not targeted and not sanskrit_ok:
            logger.warning(f"[AskVerse] No passages found for BG {chapter}.{verse}")

            if language == "Hindi":
                return (
                    f"⚠️ मैंने बहुत खोजा, लेकिन उपलब्ध स्रोतों में अध्याय {chapter}, "
                    f"श्लोक {verse} की सामग्री नहीं मिली।\n\n"
                    f"कृपया संदर्भ जाँचें या प्रश्न को अलग तरीके से पूछें।"
                )

            if language == "Gujarati":
                return (
                    f"⚠️ મેં સારી રીતે શોધ્યું, પરંતુ ઉપલબ્ધ સ્ત્રોતોમાં અધ્યાય {chapter}, "
                    f"શ્લોક {verse} માટે સામગ્રી મળી નથી.\n\n"
                    f"કૃપા કરીને સંદર્ભ તપાસો અથવા પ્રશ્નને અલગ રીતે પૂછો."
                )

            return (
                f"⚠️ I searched thoroughly but couldn't find any content for "
                f"Chapter {chapter}, Verse {verse} in the available texts.\n\n"
                f"Please verify the reference or try rephrasing your question."
            )

        if sanskrit_ok:
            verse_block = f"Sanskrit shloka from source text:\n{raw_skt}"

            if targeted:
                eng_parts = [
                    f"[Passage {i}]\n{d.page_content.strip()}"
                    for i, d in enumerate(targeted, 1)
                ]

                verse_block += "\n\nSupporting English passages:\n\n" + "\n\n".join(eng_parts)

            translation_instruction = (
                "If an English translation appears in the supporting passages, use it as the base meaning. "
                "If no English translation appears, translate the Sanskrit shloka faithfully."
            )

        else:
            passages = [
                f"[Passage {i}]\n{d.page_content.strip()}"
                for i, d in enumerate(targeted, 1)
            ]

            verse_block = (
                f"English passages retrieved for Chapter {chapter}, Verse {verse}:\n\n"
                + "\n\n".join(passages)
            )

            translation_instruction = (
                "Use the retrieved English passages as the source. "
                "If the exact translation for this verse is not in the passages, say: "
                "\"English translation not found in retrieved sources.\" "
                "Do not invent a translation."
            )

        context = self._format_context(targeted)

        template = """
You are a Bhagavad Gita scholar. The Learner asked about Chapter {chapter}, Verse {verse}.

Conversation so far:
{history}

Retrieved text for this verse:
{verse_block}

Additional formatted context:
{context}

CRITICAL RULES:
1. NEVER display garbled characters, encoding artifacts, or corrupted symbols.
2. Only include Sanskrit/Devanagari if it is clean and readable.
3. For the Sanskrit section, write the clean Devanagari from the source text.
4. If Sanskrit is unavailable or corrupted, write: Sanskrit text not available in retrieved sources.
5. For the translation section: {translation_instruction}
6. Do NOT use markdown symbols like **, *, #, or _.
7. Do NOT use bracket labels like [Chapter 1, Verse 1] in the response body.
8. Only extract Key Takeaway and Practical Application if they are present in or strictly implied by the retrieved text.
9. Language rule: {lang_rule}

Respond in EXACTLY this structured format:

🕉️ Sanskrit Shloka (BG {chapter}.{verse}):
(Write the clean Devanagari from the source. If unavailable, write: Sanskrit text not available in retrieved sources.)

🌐 Translation:
(Write the translation according to the language rule.)

💡 Key Takeaway:
(2-3 sentences: the core spiritual or philosophical teaching of this verse in simple language.)

🌿 Practical Application:
(1-2 sentences: one practical way to apply this teaching in daily life.)
"""

        resp = (ChatPromptTemplate.from_template(template) | self.llm).invoke({
            "chapter": chapter,
            "verse": verse,
            "verse_block": verse_block,
            "context": context,
            "history": history_text,
            "translation_instruction": translation_instruction,
            "language": language,
            "lang_rule": lang_rule,
        })

        return _clean_response(resp.content)

    # ── answer generation: general ────────────────────

    def _ask_general(
        self,
        question: str,
        top_k: int,
        history: list,
        language: str,
    ) -> str:
        language = normalize_language(language)
        lang_rule = language_rule(language)

        docs = self.hybrid_retrieve_expanded(question, top_k=top_k)

        if not docs:
            logger.warning(f"[AskGeneral] No passages found for: {question!r}")

            if language == "Hindi":
                return (
                    "⚠️ मुझे आपके प्रश्न के लिए भगवद गीता में संबंधित अंश नहीं मिले।\n\n"
                    "कृपया प्रश्न को अलग तरीके से पूछें, या किसी विशेष अध्याय और श्लोक के बारे में पूछें।"
                )

            if language == "Gujarati":
                return (
                    "⚠️ તમારા પ્રશ્ન માટે મને ભગવદ ગીતામાં સંબંધિત અંશો મળ્યા નથી.\n\n"
                    "કૃપા કરીને પ્રશ્નને અલગ રીતે પૂછો, અથવા કોઈ ખાસ અધ્યાય અને શ્લોક વિશે પૂછો."
                )

            return (
                "⚠️ I couldn't find relevant passages in the Bhagavad Gita for your question.\n\n"
                "Please try rephrasing, or ask about a specific chapter and verse."
            )

        context = self._format_context(docs)
        history_text = self._format_history(history)

        logger.info(f"[AskGeneral] context passages: {len(docs)}")

        template = """
You are a profound, wise Bhagavad Gita guide speaking directly to a Learner.

Conversation so far:
{history}

Learner's question:
{question}

Retrieved passages from the Bhagavad Gita:
{context}

CRITICAL RULES:
- Strongly ground your answer in the Bhagavad Gita's teachings as provided in the passages.
- If the retrieved context does not contain enough information to answer the question, clearly state:
  "I could not find information about this in the retrieved text."
- Do NOT invent or fabricate Bhagavad Gita verses.
- Only cite verses explicitly provided in the retrieved texts.
- Cite specific verses naturally as BG chapter.verse when you reference them.
- Do NOT use markdown symbols like **, *, #, or _.
- You may use normal bullet points like • or numbered lists.
- Language rule: {lang_rule}

Instructions:
1. Provide a clear, short, and well-structured answer.
2. Use bullet points where helpful.
3. Keep the response concise unless the user asks for a detailed explanation.
4. End with one practical takeaway for daily life.
"""

        resp = (ChatPromptTemplate.from_template(template) | self.llm).invoke({
            "context": context,
            "question": question,
            "history": history_text,
            "language": language,
            "lang_rule": lang_rule,
        })

        return _clean_response(resp.content)

    # ── topic relevance guard ─────────────────────────

    _GITA_KEYWORDS = frozenset({
        "gita", "bhagavad", "geeta", "bhagwat", "krishna", "arjuna", "kurukshetra",
        "pandava", "mahabharata", "shloka", "sloka", "verse", "chapter",

        "karma", "dharma", "yoga", "atman", "brahman", "moksha", "samsara",
        "nishkama", "bhakti", "jnana", "gyana", "raja", "swadharma",
        "reincarnation", "rebirth", "liberation", "detachment", "attachment",
        "renunciation", "equanimity", "surrender", "devotion",

        "tamas", "rajas", "sattva", "gunas",

        "spiritual", "soul", "self", "consciousness", "divine", "god", "lord",
        "meditation", "wisdom", "knowledge", "truth", "duty", "righteousness",
        "suffering", "fear", "courage", "faith", "worship", "prayer",
        "peace", "mind", "desire", "ego", "purpose", "life", "death",

        # Hindi/Gujarati common words
        "गीता", "भगवद", "कृष्ण", "अर्जुन", "कर्म", "धर्म", "योग", "मोक्ष",
        "આત્મા", "કર્મ", "ધર્મ", "યોગ", "મોક્ષ", "કૃષ્ણ", "અર્જુન", "ગીતા",
    })

    def _is_gita_related(self, question: str) -> bool:
        q_words = set(re.sub(r"[^\w\s]", "", question.lower()).split())

        if q_words & self._GITA_KEYWORDS:
            return True

        guard = ChatPromptTemplate.from_template(
            "Is this question related to the Bhagavad Gita, Hindu philosophy, "
            "spirituality, karma, dharma, yoga, or topics the Gita covers?\n"
            "Question: {question}\n"
            "Answer with YES or NO only."
        )

        try:
            resp = (
                guard
                | ChatGroq(
                    model_name=LLM_MODEL,
                    temperature=0,
                    max_tokens=3,
                )
            ).invoke({"question": question})

            return resp.content.strip().upper().startswith("Y")

        except Exception:
            return True

    # ── chapter/verse extraction ──────────────────────

    @staticmethod
    def _extract_chapter_verse(text: str) -> Optional[Tuple[int, int]]:
        m = re.search(
            r"chapter\s+(\d+)\s*[,]?\s*(?:verse|shloka|sloka|sh\.?|v\.)\s*(\d+)",
            text,
            re.IGNORECASE,
        )

        if m:
            return int(m.group(1)), int(m.group(2))

        m = re.search(r"\b(?:BG|Gita)\s*(\d+)[\.:](\d+)\b", text, re.IGNORECASE)

        if m:
            return int(m.group(1)), int(m.group(2))

        m = re.search(r"\b(\d{1,2})\.(\d{1,2})\b", text)

        if m:
            ch, vs = int(m.group(1)), int(m.group(2))

            if 1 <= ch <= 18 and 1 <= vs <= 78:
                return ch, vs

        m = re.search(
            r"(?:shloka|sloka|verse)\s+(\d+)\s+(?:of\s+)?chapter\s+(\d+)",
            text,
            re.IGNORECASE,
        )

        if m:
            return int(m.group(2)), int(m.group(1))

        # Hindi support: अध्याय 2 श्लोक 47
        m = re.search(
            r"अध्याय\s+(\d+)\s*(?:श्लोक|वचन|verse)\s*(\d+)",
            text,
            re.IGNORECASE,
        )

        if m:
            return int(m.group(1)), int(m.group(2))

        # Gujarati support: અધ્યાય 2 શ્લોક 47
        m = re.search(
            r"અધ્યાય\s+(\d+)\s*(?:શ્લોક|verse)\s*(\d+)",
            text,
            re.IGNORECASE,
        )

        if m:
            return int(m.group(1)), int(m.group(2))

        return None

    # ── main ask entry point ──────────────────────────

    def ask(
        self,
        question: str,
        language: str = "English",
        top_k: int = 5,
        history: list = None,
    ) -> str:
        if history is None:
            history = []

        language = normalize_language(language)

        logger.info(f"[Ask] question={question!r}, language={language!r}")

        if not self._is_gita_related(question):
            if language == "Hindi":
                return (
                    "मैं केवल भगवद गीता से जुड़े प्रश्नों के लिए बनाया गया आध्यात्मिक मार्गदर्शक हूँ। "
                    "आपका प्रश्न गीता या उसकी शिक्षाओं से संबंधित नहीं लगता।\n\n"
                    "आप मुझसे ऐसे प्रश्न पूछ सकते हैं:\n"
                    "• किसी विशेष श्लोक का अर्थ, जैसे Chapter 2 verse 47\n"
                    "• कर्म, धर्म, योग, मोक्ष जैसे विषय\n"
                    "• कर्तव्य, वैराग्य, भय, उद्देश्य या मन की शांति\n"
                    "• भगवद गीता से जुड़े आध्यात्मिक या दार्शनिक प्रश्न\n\n"
                    "🕉️ कृपया भगवद गीता से जुड़ा प्रश्न पूछें।"
                )

            if language == "Gujarati":
                return (
                    "હું માત્ર ભગવદ ગીતાથી જોડાયેલા પ્રશ્નો માટે બનાવાયેલ આધ્યાત્મિક માર્ગદર્શક છું. "
                    "તમારો પ્રશ્ન ગીતા અથવા તેની શિક્ષાઓથી સંબંધિત લાગતો નથી.\n\n"
                    "તમે મને આવા પ્રશ્નો પૂછો શકો છો:\n"
                    "• કોઈ ખાસ શ્લોકનો અર્થ, જેમ કે Chapter 2 verse 47\n"
                    "• કર્મ, ધર્મ, યોગ, મોક્ષ જેવા વિષયો\n"
                    "• કર્તવ્ય, વૈરાગ્ય, ભય, હેતુ અથવા મનની શાંતિ\n"
                    "• ભગવદ ગીતાથી જોડાયેલા આધ્યાત્મિક અથવા તત્ત્વજ્ઞાનિક પ્રશ્નો\n\n"
                    "🕉️ કૃપા કરીને ભગવદ ગીતાથી જોડાયેલો પ્રશ્ન પૂછો."
                )

            return (
                "I'm a spiritual guide dedicated solely to the Bhagavad Gita. "
                "Your question doesn't seem to be related to the Gita or its teachings.\n\n"
                "I'd be glad to help you with questions like:\n"
                "• The meaning of a specific verse, e.g. Chapter 2 verse 47\n"
                "• Concepts like karma, dharma, yoga, or moksha\n"
                "• Guidance on duty, detachment, fear, or purpose\n"
                "• Any spiritual or philosophical topic from the Gita\n\n"
                "🕉️ Please feel free to ask about the Gita!"
            )

        ref = self._extract_chapter_verse(question)

        if ref:
            chapter, verse = ref

            logger.info(f"[Ask] verse ref detected: BG {chapter}.{verse}")

            if not _valid_gita_ref(chapter, verse):
                logger.warning(f"[Ask] invalid ref BG {chapter}.{verse}")
                return _invalid_ref_message(chapter, verse, language)

            return self._ask_verse(
                chapter=chapter,
                verse=verse,
                question=question,
                history=history,
                language=language,
            )

        return self._ask_general(
            question=question,
            top_k=top_k,
            history=history,
            language=language,
        )


# ──────────────────────────────────────────────────────
#  APP STARTUP & ROUTES
# ──────────────────────────────────────────────────────

rag = VectorlessGitaRAG()


@app.on_event("startup")
async def startup_event():
    logger.info("Starting Bhagavad Gita Vectorless RAG v4.1.")
    rag.initialize()
    logger.info("System ready.")


@app.get("/", response_class=HTMLResponse, tags=["UI"])
def home():
    if os.path.exists("index.html"):
        return Path("index.html").read_text(encoding="utf-8")

    return """
    <h2>🕉️ Bhagavad Gita Vectorless RAG</h2>
    <p>index.html not found.</p>
    """


@app.post("/chat", tags=["RAG"])
def chat(query: Query):
    """
    Ask anything about the Bhagavad Gita.
    Pass history[] for multi-turn awareness.
    """
    if not query.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        selected_language = normalize_language(query.language)

        answer = rag.ask(
            question=query.question,
            language=selected_language,
            top_k=query.top_k,
            history=query.history,
        )

        return {
            "question": query.question,
            "language": selected_language,
            "answer": answer,
        }

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.get("/health", tags=["System"])
def health():
    return {
        "status": "ok",
        "version": "4.1.0",
        "chunks_loaded": len(rag.documents),
        "verses_indexed": len(rag.verse_lookup),
        "retrieval": "BM25 + TF-IDF + RRF + TF-IDF Rerank",
        "chapters": len(GITA_VERSE_COUNTS),
        "total_verses": sum(GITA_VERSE_COUNTS.values()),
        "languages": sorted(list(SUPPORTED_LANGUAGES)),
    }