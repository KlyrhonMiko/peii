from utils.feedback_heuristics import heuristic_dimension

EMPLOYABILITY = "Employability and Economic Mobility"
FAMILY_UPLIFTMENT = "Family Upliftment and Financial Stability"
PERSONAL_DEV = "Personal Development and Life Quality"
CIVIC_ENGAGEMENT = "Civic Engagement and Community Contribution"
GOVT_TRUST = "Government Trust and LGU Support Valuation"
GENERAL_FEEDBACK = "General Feedback"


def test_employability_dimension_detection():
    # CV, AI, automation, financial literacy as career skills
    ans = "CV tailoring, financial literacy, and AI and automation"
    q = "What specific technical or soft skills do you wish were given more focus at PLP?"
    assert heuristic_dimension(ans.lower(), q.lower()) == EMPLOYABILITY

    # Financial skills as career preparation
    ans2 = "Financial skills"
    q2 = "What specific technical or soft skills do you wish were given more focus at PLP?"
    assert heuristic_dimension(ans2.lower(), q2.lower()) == EMPLOYABILITY

    # Internship and job placement
    ans3 = (
        "More internship opportunities and corporate industry partnerships for "
        "graduating students"
    )
    q3 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans3.lower(), q3.lower()) == EMPLOYABILITY


def test_personal_development_dimension_detection():
    # Seminars, financial literacy, leadership
    ans = (
        "Integrate program or seminars that support students' financial "
        "literacy and leadership"
    )
    q = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans.lower(), q.lower()) == PERSONAL_DEV

    # Soft skills, mental health, wellness
    ans2 = "Workshops for stress management, mental health, and public speaking confidence"
    q2 = "What specific technical or soft skills do you wish were given more focus at PLP?"
    assert heuristic_dimension(ans2.lower(), q2.lower()) == PERSONAL_DEV


def test_general_feedback_fallback_for_campus_facilities():
    # Campus free printing should fall back to General Feedback, NOT Family Upliftment
    ans = "To provide assistance especially in free printing"
    q = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans.lower(), q.lower()) == GENERAL_FEEDBACK

    # Campus Wi-Fi and air conditioning
    ans2 = "Fix the air conditioning in the classrooms and provide reliable Wi-Fi access"
    q2 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans2.lower(), q2.lower()) == GENERAL_FEEDBACK

    # Campus library hours
    ans3 = "Extend library hours and provide quiet study areas"
    q3 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans3.lower(), q3.lower()) == GENERAL_FEEDBACK


def test_family_upliftment_matches_genuine_household_contexts():
    # Not burdening family
    ans = (
        "Thank you for all the opportunities, I was able to finish my study without "
        "burdening my family. This is something that I will be forever grateful of."
    )
    q = "What message would you like to share with Pasig City leaders regarding PLP?"
    assert heuristic_dimension(ans.lower(), q.lower()) == FAMILY_UPLIFTMENT

    # Supporting parents and building a house
    ans2 = (
        "Naitaguyod ko ang aking pamilya at nakapagpundar ng sariling bahay dahil sa "
        "magandang trabaho na dulot ng aking diploma sa PLP."
    )
    q2 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans2.lower(), q2.lower()) == FAMILY_UPLIFTMENT

    # Household and parents out of debt
    ans3 = (
        "Nakatulong ito upang makapagtapos ako nang walang utang ang aking mga magulang "
        "at maiahon ang aming pamilya."
    )
    q3 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans3.lower(), q3.lower()) == FAMILY_UPLIFTMENT


def test_civic_engagement_matches_community_service():
    ans = (
        "Develop innovative and sustainable projects that can address societal challenges "
        "and respond to community needs to create meaningful impacts on society."
    )
    q = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans.lower(), q.lower()) == CIVIC_ENGAGEMENT

    ans2 = "More volunteer opportunities and civic engagement in our local barangay"
    q2 = "What improvements should PLP implement to better support students?"
    assert heuristic_dimension(ans2.lower(), q2.lower()) == CIVIC_ENGAGEMENT


def test_government_trust_matches_lgu_and_leadership():
    ans = (
        "Maraming salamat kay Mayor Vico Sotto at sa Pasig LGU para sa libreng tuition "
        "at scholarship."
    )
    q = "What message would you like to share with Pasig City leaders regarding PLP?"
    assert heuristic_dimension(ans.lower(), q.lower()) == GOVT_TRUST
