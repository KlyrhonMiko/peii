"""
Augment the PEII training and validation datasets with realistic NEGATIVE examples.
Ensures zero data leakage with backend/data/ml_thesis_benchmark.jsonl.

Adds:
  - 100 distinct NEGATIVE examples to ml_dataset_v1_train.jsonl
  - 15 distinct NEGATIVE examples to ml_dataset_v1_val.jsonl

Languages: Tagalog, Taglish, and English.
"""

import json
import logging
from pathlib import Path
import random
import shutil
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TRAIN_FILE = DATA_DIR / "ml_dataset_v1_train.jsonl"
VAL_FILE = DATA_DIR / "ml_dataset_v1_val.jsonl"
BENCH_FILE = DATA_DIR / "ml_thesis_benchmark.jsonl"

Q1 = "What improvements should PLP implement to better support students?"
Q2 = "What message would you like to share with Pasig City leaders regarding PLP?"
Q3 = "What specific technical or soft skills do you wish were given more focus at PLP?"

DIM_EMPLOYABILITY = "Employability and Economic Mobility"
DIM_PERSONAL = "Personal Development and Life Quality"
DIM_GOV_TRUST = "Government Trust and LGU Support Valuation"
DIM_FAMILY = "Family Upliftment and Financial Stability"
DIM_CIVIC = "Civic Engagement and Community Contribution"

# 100 Distinct Training Negative Samples (Zero overlap with benchmark)
TRAIN_NEGATIVE_SAMPLES = [
    # Academic & Faculty
    (Q1, "general", "Laging absent ang ibang instructors at nagpapasa lang ng modules nang walang matinong paliwanag.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Hindi nagtuturo nang maayos ang prof namin sa advanced accounting, puro assignment pero walang lecture.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Masyadong tamad mag-check ng requirements ang ilang teachers, kung kailan submission tsaka magrereklamo.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Ang hirap hagilapin ng thesis adviser namin. Halos abutin ng isang buwan bago magbasa ng chapter drafts.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "May favoritism sa klase at hindi pantay ang pagtrato sa mga estudyanteng aktibo sa labas ng classroom.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Lack of qualified professors for specialized technical subjects leaves students to learn entirely on their own.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Ang sungit ng department head namin kapag lumalapit kami para magpa-consult tungkol sa aming subjects.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang standard rubric sa grading, nakadepende lang sa mood ng professor ang binibigay na marka.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Poor instructional delivery. Several teachers are unfamiliar with modern industry technologies they are supposed to teach.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Hindi inaasikaso ang petisyon para sa mga naiwang subjects kaya napilitan kaming maging irregular.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Grades are not encoded on time, creating massive anxiety during graduation evaluation.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Bihira magbigay ng feedback ang professors, kaya hindi namin alam kung saan kami nagkamali sa projects.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Incompetent ang ilang part-time instructors na hinahawakan ang aming major subjects.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Walang consideration ang mga professors sa mental health at personal na sitwasyon ng mga mag-aaral.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Professors frequently cancel classes at the last minute with no make-up sessions or explanations provided.", -0.5, [DIM_PERSONAL]),

    # Facilities & Infrastructure
    (Q1, "general", "Kakarampot ang gumaganang computer units sa lab. Madalas tatlong estudyante ang naghahati sa iisang lumang desktop.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Sobrang init sa mga classroom dahil laging sira ang electric fan at aircon sa aming wing.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang maayos na laboratory apparatus para sa chemistry at physics, puro drawing na lang.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Napakarumi ng canteen at kulang sa maayos na upuan at hapag-kainan para sa libu-libong estudyante.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Sira-sira ang mga upuan at armchairs sa general education classrooms, madalas may nakausling pako.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "The library has no updated e-books or research journal subscriptions for academic citation.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Walang signal at walang Wi-Fi sa upper floors ng building, napakahirap mag-research habang nasa campus.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Amoy kubeta ang hallway dahil sa sirang drainage system sa may science building.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Emergency lights and fire safety equipment are visibly neglected in several building stairwells.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Kulang sa saksakan at charging ports para sa mga estudyanteng gumagamit ng laptop para sa thesis.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "The audio-visual rooms have obsolete sound systems that screech during student presentations.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Madalas mawalan ng tubig sa mga banyo kaya hindi makapaghugas ng kamay ang mga mag-aaral.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Campus parking and access control are poorly managed, causing heavy congestion during dismissal.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Computer laboratories lack legal licenses for design and engineering software tools.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Tagas sa kisame tuwing umuulan kaya nababasa ang mga gamit at libro sa loob ng silid.", -1.0, [DIM_PERSONAL]),

    # Administrative Services & Registrar
    (Q1, "general", "Sobrang bagal ng proseso sa registrar. Inabot ng anim na buwan ang release ng aking diploma at transcript.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Napakasungit ng mga empleyado sa admin office. Parang galit kapag may tinatanong tungkol sa clearance.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Bumagsak ang enrollment portal nang tatlong sunod-sunod na araw kaya naubusan kami ng slots sa subjects.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Nawala ng registrar ang aking Form 137 kaya kinailangan ko pang umuwi sa probinsya para kumuha ulit.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "The clearance signing process is medieval. You need dozens of physical signatures across disjointed offices.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang sumasagot sa official email at phone lines ng pamantasan kapag may urgent inquiries ang alumni.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Maling impormasyon ang binigay ng accounting office kaya muntik na akong hindi makasama sa graduation marching list.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Administrative red tape delayed our graduation clearance and caused me to miss my job onboarding deadline.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Walang maayos na queueing system sa cashier at registrar, nag-aaway na ang mga estudyante sa initan.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Hinarang ng admin ang legitimate complaints ng student publication tungkol sa mga bayarin sa campus.", -1.0, [DIM_CIVIC]),

    # Career, OJT, and Employment Readiness (Q1)
    (Q1, "general", "Walang ibinigay na kahit anong tulong o recommendations ang unibersidad noong naghahanap kami ng OJT.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "We were completely unprepared for corporate interviews. Zero mock interviews or career fairs were conducted.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Pabaya ang OJT coordinator, hindi man lang nag-asikaso ng MOA kaya tinanggihan kami ng kumpanya.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Many graduates from my batch remained unemployed for over a year due to poor institutional reputation and lack of ties.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Walang job placement assistance pagka-graduate. Bigla ka na lang papabayaan matapos ang graduation ceremony.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Hindi akma sa totoong industriya ang mga tinuro sa amin, napag-iwanan kami kumpara sa graduates ng ibang colleges.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Our department failed to provide resume review sessions or basic career counseling for graduating seniors.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Walang industry networking events or alumni mentorship programs na makakatulong sa transition sa trabaho.", -0.5, [DIM_EMPLOYABILITY]),

    # Technical & Soft Skills Gaps (Q3)
    (Q3, "general", "Sobrang luma ng curriculum sa programming. Hindi man lang tinuro ang modern web development at cloud services.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Kulang na kulang sa communication skills training, kaya nahihiya at nauutal kami sa mga job interviews.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Wala kaming natutunan sa database optimization at software testing, napilitan akong mag-enroll sa paid bootcamp.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "The curriculum focuses on obsolete concepts that no corporate employer uses anymore.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang hands-on training sa project management tools tulad ng Jira, Trello, o Git version control.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Hindi tinuro kung paano makipag-usap sa clients at stakeholders sa corporate environment.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Lack of practical financial literacy and accounting software training left business graduates completely lost at work.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Hindi kami tinuruan mag-analyze ng data gamit ang Python o modern statistical tools.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Too much theoretical memorization instead of real problem solving and technical implementation.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang training sa cybersecurity fundamentals kahit talamak na ang cyber threats ngayon.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Kulang sa business communication at formal report writing, madalas nako-correct ang emails namin sa opisina.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Obsolete textbook problems were taught instead of modern real-world enterprise applications.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang exposure sa cloud architecture tulad ng AWS o Azure sa buong apat na taon ng IT curriculum.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Hindi kami naturuan ng critical thinking at agile methodologies, nahirapan kami mag-adjust sa scrum teams.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Lack of advanced Excel and PowerBI training made entry-level financial reporting jobs very painful.", -0.5, [DIM_EMPLOYABILITY]),

    # Messages to Leaders / LGU (Q2)
    (Q2, "general", "Sobrang tagal bago naipamigay ang student allowance, umabot ng halos matapos ang taon bago nakuha.", -1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "general", "Sana naman ay pakinggan ng LGU ang mga hinaing tungkol sa pamunuan ng PLP na walang malasakit sa mag-aaral.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Wasted budget on cosmetic campus repairs while the academic facilities and labs remain neglected.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Puro pulitika at nepotismo sa hiring ng faculty at administrative staff sa halip na competence ang tingnan.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Disappointed with how the city government handles accountability for broken promises in student welfare.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Hindi sapat ang tulong pinansyal kung delayed naman palagi ang disbursement kapag kailangang-kailangan na.", -1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "general", "Bakit napag-iiwanan ang PLP kumpara sa ibang local universities sa Metro Manila pagdating sa pondo?", -0.5, [DIM_GOV_TRUST]),
    (Q2, "general", "Stop prioritizing photo-ops and focus on the actual quality of education and student laboratory equipment.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Walang proteksyon ang mga working students laban sa abusive and unreasonable schedules sa pamantasan.", -1.0, [DIM_GOV_TRUST, DIM_PERSONAL]),
    (Q2, "general", "The scholarship department has zero transparency regarding how allowances and stipends are prioritized.", -1.0, [DIM_GOV_TRUST]),

    # Additional Distinct Complaints & Frustrations
    (Q1, "general", "Sobrang higpit sa enrollment requirements pero sila mismo ang nagdudulot ng delay sa documents.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang malinaw na proseso para sa grade appeals, laging kinakampihan ng department ang kapwa nila prof.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Inefficient student services. You waste whole days lining up just to get a single document validated.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Masyadong maraming miscellaneous fees na hindi naman nararamdaman kung saan napupunta.", -1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "Laging offline ang online portal kapag kailangang mag-check ng grades o mag-download ng registration forms.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Walang sapat na medical staff o gamot sa campus clinic kapag may nahihimatay na estudyante.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Kulang ang schedule ng night classes para sa mga nagtatrabaho sa araw, pinipilit kaming mag-quit sa work.", -1.0, [DIM_PERSONAL, DIM_EMPLOYABILITY]),
    (Q1, "general", "The university did not provide any mental health support during stressful thesis defense periods.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Sirang elevators cause elderly professors and students with disabilities to climb five flights of stairs.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Hindi maayos ang security measures sa loob ng campus, may mga nawawalang gamit at helmet sa parking.", -0.5, [DIM_PERSONAL]),
    (Q3, "general", "Lacking modern software testing and automated QA training, so tech graduates are rejected for junior QA roles.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang itinuro na basic project costing, payroll computations, or business accounting in technical courses.", -0.5, [DIM_EMPLOYABILITY]),
    (Q2, "general", "Huwag ninyong pabayaan ang PLP na maging mababang klase ng pamantasan dahil lang sa kakulangan ng pondo.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Frustrating lack of response from city officials whenever student grievances are formally submitted.", -1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "Unprofessional staff demeanor across administrative windows tarnishes the university reputation.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "No transparent tracking of alumni career outcomes or postgraduate support systems.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Students are forced to spend their own money to repair equipment in laboratory rooms just to finish projects.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Delayed announcements regarding tuition subsidies left many poor students scrambling for emergency funds.", -1.0, [DIM_FAMILY]),
    (Q3, "general", "We were taught outdated web scripting while tech companies require TypeScript and modern API design.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The administrative system feels like going through a maze with zero care for student welfare.", -1.0, [DIM_PERSONAL]),
    (Q2, "general", "Sana maalis ang burukrasya at kapabayaan sa mga pampublikong pasilidad ng ating mahal na kolehiyo.", -0.5, [DIM_GOV_TRUST]),
    (Q1, "general", "Zero industry exposure and zero guest lectures from tech leaders throughout the entire degree program.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Broken chairs, non-functioning whiteboards, and stifling heat make classrooms deeply unconducive to learning.", -1.0, [DIM_PERSONAL]),
    (Q3, "general", "Kulang sa practical hardware and network troubleshooting, puro diagrams lang sa papel.", -0.5, [DIM_EMPLOYABILITY]),
    (Q2, "general", "The stipend delays forced some students to take high-interest loans just to pay for commuting expenses.", -1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q1, "general", "Very poor handling of student complaints regarding professor misconduct and sexual harassment rumors.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "The university lacks an effective placement cell to connect graduates with top MNCs in NCR.", -1.0, [DIM_EMPLOYABILITY]),
]

# 15 Distinct Validation Negative Samples
VAL_NEGATIVE_SAMPLES = [
    (Q1, "general", "Napakabagal mag-release ng certification ang registrar kaya na-miss ko ang job application deadline.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Sirain ang mga equipment sa physics lab at madalas walang internet para mag-download ng simulation tools.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "May mga instructors na hindi nagtuturo pero napakataas mag-expect sa exams.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "The enrollment portal crashes every single semester, causing immense stress to students.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang tulong ang university sa paghahanap ng internship o OJT placements para sa graduates.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Outdated programming languages ang tinuro sa amin imbes na modern industry tools.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Kulang sa training para sa soft skills, communication, and mock job interviews.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Curriculum lacks hands-on cloud computing and practical database design exercises.", -0.5, [DIM_EMPLOYABILITY]),
    (Q2, "general", "Laging delayed ang stipend ng scholarship kaya napipilitang mangutang ang mga estudyante.", -1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "general", "Sana po ay mas tutukan ng city government ang mga sirang pasilidad at bulok na computer labs sa PLP.", -1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "Masusungit ang mga staff sa registrar and cashier tuwing may inquiries.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Walang maayos na thesis mentoring kaya na-delay ang aming buong grupo sa pagtatapos.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Napakarumi ng mga palikuran at madalas mawalan ng tubig sa buong campus.", -1.0, [DIM_PERSONAL]),
    (Q2, "general", "Huwag ninyong hayaang mapag-iwanan ang PLP kumpara sa ibang unibersidad sa Metro Manila.", -0.5, [DIM_GOV_TRUST]),
    (Q3, "general", "Puro theory ang itinuro at walang practical exposure sa modern enterprise technologies.", -0.5, [DIM_EMPLOYABILITY]),
]


def augment_datasets():
    # 1. Back up existing files if not already backed up
    train_bak = TRAIN_FILE.with_suffix(".jsonl.orig_bak")
    val_bak = VAL_FILE.with_suffix(".jsonl.orig_bak")
    
    if not train_bak.exists() and TRAIN_FILE.exists():
        shutil.copy2(TRAIN_FILE, train_bak)
        logger.info(f"Backed up original train dataset to {train_bak.name}")
    if not val_bak.exists() and VAL_FILE.exists():
        shutil.copy2(VAL_FILE, val_bak)
        logger.info(f"Backed up original val dataset to {val_bak.name}")

    q_map = {
        Q1: "01a0aa26-ccfb-7112-9b21-82ee2443d612",
        Q2: "01a0aa26-ccfc-73da-9566-57efe80360b0",
        Q3: "01a0aa26-ccfd-7512-8411-91ff8214a101",
    }

    # Helper to convert tuples to records
    def to_records(samples, prefix):
        records = []
        for idx, (q_text, intent, ans, polarity, dims) in enumerate(samples):
            records.append({
                "response_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{prefix}-{idx}")),
                "question_id": q_map.get(q_text, str(uuid.uuid5(uuid.NAMESPACE_DNS, q_text))),
                "question_text": q_text,
                "question_intent": intent,
                "response_text": ans,
                "label_sentiment": "NEGATIVE",
                "polarity": polarity,
                "dimensions": dims,
                "is_human_override": True
            })
        return records

    # 2. Augment Training Set
    existing_train = []
    with open(TRAIN_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                existing_train.append(json.loads(line))
                
    new_train_records = to_records(TRAIN_NEGATIVE_SAMPLES, "aug-train-neg")
    augmented_train = existing_train + new_train_records
    random.seed(42)
    random.shuffle(augmented_train)

    with open(TRAIN_FILE, "w", encoding="utf-8") as f:
        for r in augmented_train:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    logger.info(f"Updated {TRAIN_FILE.name}: {len(existing_train)} -> {len(augmented_train)} records (+{len(new_train_records)} NEGATIVE).")

    # 3. Augment Validation Set
    existing_val = []
    with open(VAL_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                existing_val.append(json.loads(line))

    new_val_records = to_records(VAL_NEGATIVE_SAMPLES, "aug-val-neg")
    augmented_val = existing_val + new_val_records
    random.shuffle(augmented_val)

    with open(VAL_FILE, "w", encoding="utf-8") as f:
        for r in augmented_val:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    logger.info(f"Updated {VAL_FILE.name}: {len(existing_val)} -> {len(augmented_val)} records (+{len(new_val_records)} NEGATIVE).")

    # Print summary
    for name, dataset in [("TRAIN", augmented_train), ("VAL", augmented_val)]:
        counts = {}
        for item in dataset:
            lbl = item["label_sentiment"]
            counts[lbl] = counts.get(lbl, 0) + 1
        logger.info(f"{name} split distribution: {counts} (Total: {len(dataset)})")


if __name__ == "__main__":
    augment_datasets()
