import re

# Refined dimension regexes for Filipino and English graduate tracer feedback.
# Accurately discriminates between the 5 PEII domains and prevents over-matching
# broad keywords (such as bare "provide" or bare "financial").
# Includes Tagalog terms to handle code-switching in Filipino graduate responses.
DIMENSION_REGEXES: dict[str, re.Pattern[str]] = {
    "Employability and Economic Mobility": re.compile(
        r"\b("
        r"job\w*|career\w*|work\b|working\b|workers?\b|worked\b|employ\w*|trabaho|hanapbuhay|workplace|professional\w*|"
        r"salary|salaries|sweldo|sahod|income|economic\s+mobility|earning|"
        r"hire\w*|hiring|promot\w*|job\s+search|job\s+hunting|job\s+placement|"
        r"cv\b|resume\w*|curriculum\s+vitae|portfolio|interview\w*|mock\s+interview\w*|"
        r"internship\w*|ojt\b|practicum|apprentice\w*|immersion|industry\w*|industry\s+partnerships?|"
        r"technical\s+skills?|tech\s+skills?|ai\b|artificial\s+intelligence|automation|machine\s+learning|"
        r"programming|coding|software|developer|it\s+skills?|technology\w*|tech\b|"
        r"computer\s+literacy|digital\s+literacy|"
        r"financial\s+literacy|financial\s+skills?|financial\s+management|"
        r"business\w*|negosyo|freelanc\w*|entrepreneur\w*|corporate|labor\s+market|"
        r"training\w*|certifications?|competenc\w*"
        r")\b",
        re.IGNORECASE,
    ),
    "Family Upliftment and Financial Stability": re.compile(
        r"\b("
        r"family|pamilya|pampamilya|parents|magulang|anak|children|kapatid|siblings?|"
        r"household|living\s+conditions?|tahanan|sariling\s+bahay|"
        r"tulong\s+sa\s+pamilya|suporta\s+sa\s+pamilya|suportahan\s+ang\s+pamilya|"
        r"maiahon|naitaguyod|itaguyod|makaahon|kahirapan|poverty|"
        r"gastusin\s+(?:sa\s+bahay|ng\s+pamilya)|pabigat\s+sa\s+pamilya|"
        r"provide\s+(?:for\s+)?(?:my\s+|our\s+|the\s+)?(?:family|pamilya|parents|magulang|household)|"
        r"financial\s+(?:stability|security|burden|independence|struggles?|situation\s+of\s+my\s+family)|"
        r"breadwinner|kinabukasan|ahon|financial\s+support|savings|utang|debt|expenses|bills|tuition|"
        r"mother|father|mama|papa|kuya|ate|poor|hirap"
        r")\b",
        re.IGNORECASE,
    ),
    "Personal Development and Life Quality": re.compile(
        r"\b("
        r"grow\w*|growth|mindset|"
        r"leadership|soft\s+skills?|communication|public\s+speak\w*|presentation|interpersonal|"
        r"confidence|self-confidence|self-esteem|self-improvement|sarili|buhay|"
        r"life\s+quality|quality\s+of\s+life|wellness|well-being|wellbeing|mental\s+health|stress|counsell?ing|mental\s+support|guidance|"
        r"seminars?|workshops?|webinars?|life\s+skills?|"
        r"curricular|extracurricular|courses?|major\s+in|debate|experiential|"
        r"academic\w*|teach\w*|teachers?|professors?|instructors?|guro|pedagogy|lessons?|class\b|classes|subjects?|teaching\s+resources|learning\s+materials|literature|books|"
        r"facilities|equipment|laboratory|study\w*|projects?|graduat\w*|educat\w*|learn\w*|degree"
        r")\b",
        re.IGNORECASE,
    ),
    "Civic Engagement and Community Contribution": re.compile(
        r"\b("
        r"community|komunidad|civic\w*|society|lipunan|volunteer\w*|bayanihan|"
        r"giving\s+back|give\s+back|paglilingkod|ambag\s+sa\s+lipunan|pagtulong\s+sa\s+kapwa|"
        r"serbisyo\s+sa\s+bayan|serve\s+(?:the\s+)?(?:community|society|country|bayan)|"
        r"community\s+service|outreach|advocacy|advocate|active\s+citizen\w*|"
        r"contribut\w+\s+(?:to\s+)?(?:the\s+)?(?:community|society|lipunan|bayan)|"
        r"environment|kalikasan|kapwa|social\s+responsibility|awareness|public\s+service|nation\s+building|youth\s+empowerment|involve\w*|participat\w*"
        r")\b",
        re.IGNORECASE,
    ),
    "Government Trust and LGU Support Valuation": re.compile(
        r"\b("
        r"mayor|vico|sotto|lgu\b|local\s+government|pamahalaan|gobyerno|"
        r"pasig(?:\s+city)?|city\s+hall|lungsod\s+ng\s+pasig|pasigue[ñn]o\w*|"
        r"city\s+leaders?|lgu\s+leaders?|officials?|public\s+servant\w*|"
        r"scholarship\w*|iskolar\w*|stipend\w*|allowance\w*|subsid\w+|"
        r"tuition[-\s]free|libre\w*\s+tuition|financial\s+aid|ayuda|"
        r"public\s+investment|government\s+support|government\s+programs?|lgu\s+programs?|"
        r"trust\s+(?:in|the)\s+(?:local\s+)?government|tiwala\s+sa\s+pamahalaan|"
        r"uniforms?|printing|devices?|laptops?|ipads?|tablets?"
        r")\b",
        re.IGNORECASE,
    ),
}

# Keyword hints extracted from question text to pre-bias dimension scoring
# before running the keyword regex scan over the answer text.
QUESTION_DIM_HINTS: list[tuple[str, str]] = [
    ("technical", "Employability and Economic Mobility"),
    ("career", "Employability and Economic Mobility"),
    ("job", "Employability and Economic Mobility"),
    ("leaders", "Government Trust and LGU Support Valuation"),
    ("pasig", "Government Trust and LGU Support Valuation"),
    ("community", "Civic Engagement and Community Contribution"),
    ("society", "Civic Engagement and Community Contribution"),
    ("family", "Family Upliftment and Financial Stability"),
    ("financial", "Family Upliftment and Financial Stability"),
    ("personal", "Personal Development and Life Quality"),
    ("skills", "Personal Development and Life Quality"),
    ("academic", "Personal Development and Life Quality"),
]


def heuristic_dimension(answer_lower: str, question_lower: str) -> str:
    """Return the best-matching PEII dimension using keyword scoring.

    Combines a question-text pre-bias with keyword regex scanning of the
    answer body. Falls back to 'General Feedback' when no specific PEII
    dimension keyword is found.
    """
    dim_scores: dict[str, float] = {
        "Employability and Economic Mobility": 0.0,
        "Family Upliftment and Financial Stability": 0.0,
        "Personal Development and Life Quality": 0.0,
        "Civic Engagement and Community Contribution": 0.0,
        "Government Trust and LGU Support Valuation": 0.0,
        "General Feedback": 0.3,  # small baseline prior for empty/unmatched text
    }

    # Pre-bias from question text
    for hint_kw, hint_dim in QUESTION_DIM_HINTS:
        if hint_kw in question_lower:
            dim_scores[hint_dim] += 1.0
            break

    # Keyword regex scan of answer body with match frequency weighting
    for dim, pattern in DIMENSION_REGEXES.items():
        matches = len(pattern.findall(answer_lower))
        if matches > 0:
            # Drastically boost rare dimensions so they win ties and get promoted easily
            if dim == "Civic Engagement and Community Contribution":
                dim_scores[dim] += 5.0 + (matches * 2.0)
            elif dim == "Family Upliftment and Financial Stability":
                dim_scores[dim] += 4.5 + (matches * 2.0)
            else:
                dim_scores[dim] += 1.5 + (matches * 0.5)

    best = max(dim_scores, key=lambda d: dim_scores[d])
    # Only promote away from "General Feedback" if a real dimension won
    if best == "General Feedback" or dim_scores[best] <= 0.3:
        return "General Feedback"
    return best
