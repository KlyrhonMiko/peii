import json
import logging
from pathlib import Path
import random
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TRAIN_FILE = DATA_DIR / "ml_dataset_v1_train.jsonl"
VAL_FILE = DATA_DIR / "ml_dataset_v1_val.jsonl"

Q1 = "What improvements should PLP implement to better support students?"
Q2 = "What message would you like to share with Pasig City leaders regarding PLP?"
Q3 = "What specific technical or soft skills do you wish were given more focus at PLP?"

DIM_EMPLOYABILITY = "Employability and Economic Mobility"
DIM_PERSONAL = "Personal Development and Life Quality"
DIM_GOV_TRUST = "Governance Trust and LGU Support Valuation"
DIM_FAMILY = "Family Upliftment and Financial Stability"
DIM_CIVIC = "Civic Engagement and Community Contribution"

# Adversarial Positives: Answering an "improvements/negative" question with pure praise
ADVERSARIAL_POSITIVES = [
    (Q1, "general", "Napakagaling ng mga professors natin! They always make sure everyone understands the lesson.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "I have no improvements to suggest. The university gave me everything I needed to succeed.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Salamat po sa mga naging guro ko, ang galing niyo po magturo at napakabait.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Everything was perfect during my stay. Ang ganda ng facilities at ang babait ng admin.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Wala akong masabi kundi maraming salamat. The best ang PLP sa paghubog sa aming mga estudyante.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Super proud ako sa PLP. We are highly competitive pagdating sa board exams.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The quality of instruction is already world-class for me. Thanks to all my mentors.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Sobra akong nagpapasalamat sa scholarship na binigay ng LGU. Sobrang laking tulong.", 1.0, [DIM_FAMILY, DIM_GOV_TRUST]),
    (Q3, "general", "Wala akong maisip na kulang, ang dami kong natutunan na nagagamit ko sa trabaho ngayon.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "The technical skills taught were exactly what the industry needed. Highly commendable!", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "I am very satisfied with how they handled our soft skills training during capstone.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Magaling ang aming curriculum, it prepared us perfectly for the real world.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Honestly, just keep doing what you are doing. The professors are brilliant.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Pinakamagandang desisyon sa buhay ko ang mag-aral sa PLP. Salamat sa lahat!", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "My time at PLP was truly life-changing. Great environment and great people.", 1.0, [DIM_PERSONAL]),
    (Q3, "general", "Ang galing ng mga itinuro sa amin, nakahanap agad ako ng trabaho.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Sapat na sapat ang itinuro sa amin sa programming at business logic.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Wala na po akong idadagdag, the best ang PLP!", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Solid ang training, mababait ang admin. Wala akong maipipintas.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Very thankful for the opportunity to study here. Padayon PLP!", 1.0, [DIM_PERSONAL]),
    # More variations
    (Q1, "general", "Napakagagaling at napakasipag ng mga propesor sa PLP. Hinubog nila kami hindi lang sa talino kundi pati sa kagandahang asal.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "The quality of instruction exceeded my expectations. Our professors were passionate mentors who truly cared about our growth.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Solid ang training sa PLP pagdating sa board exams! Proud to say na nakapasa ako in one take dahil sa galing ng review sessions.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Napakabait at accommodating ng mga teachers. Kahit mahirap ang mga lessons, laging handang mag-explain muli.", 0.5, [DIM_PERSONAL]),
    (Q1, "general", "The university fostered a supportive and collaborative student community that helped me build lifelong professional networks.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Dahil sa magandang pundasyon ng PLP, nakakuha agad ako ng trabaho bilang Software Engineer 2 weeks after graduation.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "My education at PLP directly contributed to my current promotion as a Team Lead. The perseverance taught to us was invaluable.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Competitive ang mga graduates ng PLP sa industry! Hindi kami nagpahuli sa mga nagtapos sa kilalang unibersidad.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Sobrang ganda ng itinuro sa aming research methodology at quantitative analysis. Nagagamit ko ito araw-araw sa aking trabaho.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Teamwork, empathy, and ethical leadership were strongly instilled throughout all four years of my stay.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Isang karangalan na makatapos sa Pamantasan ng Lungsod ng Pasig. Mataas ang tingin ng mga kumpanya sa ating mga graduates.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Everything I learned from my alma mater has helped me navigate life with integrity, resilience, and compassion.", 1.0, [DIM_PERSONAL]),
]

# Constructive Neutrals: Using words like "sana", "improve", "kailangan" but tone is mild/suggestion
CONSTRUCTIVE_NEUTRALS = [
    (Q1, "suggestion", "Sana madagdagan ang mga computer units sa computer laboratory upang hindi mag-share ang mga estudyante sa isang PC.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "PLP should consider partnering with more local government offices and private firms for OJT placement.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "Mungkahi ko na magkaroon ng mas maayos na online enrollment system para maiwasan ang mahabang pila sa registrar.", 0.0, [DIM_PERSONAL]),
    (Q1, "suggestion", "It would be beneficial to conduct regular curriculum reviews to ensure course syllabi align with current industry standards.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "Sana magkaroon ng mas maraming elective subjects para makapili ang mga mag-aaral ng kanilang specialization.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "Consider implementing hybrid learning setups for some general education subjects to ease classroom congestion.", 0.0, [DIM_PERSONAL]),
    (Q1, "suggestion", "Dapat mas palawakin ang seminar at workshops tungkol sa mental health awareness at stress management.", 0.5, [DIM_PERSONAL]),
    (Q1, "suggestion", "Provide more study areas and power outlets around the university library for students working on research.", 0.0, [DIM_PERSONAL]),
    (Q1, "suggestion", "Sana mas maagang i-release ang class schedules bago magsimula ang semestre upang makapagplano ang mga working students.", 0.0, [DIM_PERSONAL]),
    (Q1, "suggestion", "Encourage faculty to adopt standard learning management systems (like Google Classroom or Canvas) uniformly.", 0.5, [DIM_PERSONAL]),
    (Q3, "suggestion", "Mas pagtuunan sana ng pansin ang practical coding at modern frameworks tulad ng React, Node.js, at Python.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Sana magkaroon ng mas maraming activities para sa public speaking, presentation skills, and business writing.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Focus more on data analysis tools like Excel, PowerBI, and basic SQL across all business and tech majors.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Dapat sanayin ang mga estudyante sa technical interviews and resume building bago pa man magtapos.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Incorporate project management methodologies such as Agile and Scrum into the capstone project workflow.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "I-recommend ko na magkaroon ng foreign language electives or advanced conversational English training.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Hands-on experience in financial management, tax filing, and basic labor law would be very practical.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "More case studies and real-world client interaction instead of purely theoretical textbook examinations.", 0.0, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Mas magandang may exposure ang mga estudyante sa cloud computing concepts at containerization tulad ng Docker.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Soft skills tulad ng conflict resolution, negotiation, and teamwork dynamics should be practiced in group projects.", 0.5, [DIM_PERSONAL]),
    (Q2, "suggestion", "Sana po ay patuloy na suportahan ng Pamahalaang Lungsod ng Pasig ang mga pasilidad at modernisasyon ng PLP.", 0.5, [DIM_GOV_TRUST]),
    (Q2, "suggestion", "Please consider establishing an official PLP alumni tracking and employment linkage program with Pasig business districts.", 0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "suggestion", "Maaari po sanang palawakin ang partnerships ng LGU sa mga multinational corporations sa Ortigas Center para sa OJT.", 0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "suggestion", "Keep expanding scholarship opportunities and student subsidies to cover book allowances and capstone materials.", 0.5, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "suggestion", "Sana po ay magkaroon ng research grants para sa mga magagandang undergraduate theses ng mga taga-PLP.", 0.5, [DIM_GOV_TRUST]),
    (Q2, "suggestion", "Regular monitoring of the university's academic quality and faculty welfare would help maintain competitive standards.", 0.5, [DIM_GOV_TRUST]),
]

def to_records(samples, prefix, label):
    q_map = {
        Q1: "01a0aa26-ccfb-7112-9b21-82ee2443d612",
        Q2: "01a0aa26-ccfc-73da-9566-57efe80360b0",
        Q3: "01a0aa26-ccfd-7512-8411-91ff8214a101",
    }
    records = []
    for idx, (q_text, intent, ans, polarity, dims) in enumerate(samples):
        records.append({
            "response_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{prefix}-{idx}")),
            "question_id": q_map.get(q_text, str(uuid.uuid5(uuid.NAMESPACE_DNS, q_text))),
            "question_text": q_text,
            "question_intent": intent,
            "response_text": ans,
            "label_sentiment": label,
            "polarity": polarity,
            "dimensions": dims,
            "is_human_override": True
        })
    return records

def add_to_file(filepath, new_records):
    existing = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                existing.append(json.loads(line))
                
    combined = existing + new_records
    random.seed(42)
    random.shuffle(combined)
    
    with open(filepath, "w", encoding="utf-8") as f:
        for r in combined:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            
    return existing, combined

def main():
    train_pos = to_records(ADVERSARIAL_POSITIVES[:25], "adv-pos-train", "POSITIVE")
    train_neu = to_records(CONSTRUCTIVE_NEUTRALS[:20], "cons-neu-train", "NEUTRAL")
    
    val_pos = to_records(ADVERSARIAL_POSITIVES[25:], "adv-pos-val", "POSITIVE")
    val_neu = to_records(CONSTRUCTIVE_NEUTRALS[20:], "cons-neu-val", "NEUTRAL")
    
    old, new = add_to_file(TRAIN_FILE, train_pos + train_neu)
    logger.info(f"Updated {TRAIN_FILE.name}: {len(old)} -> {len(new)} records")
    
    old_v, new_v = add_to_file(VAL_FILE, val_pos + val_neu)
    logger.info(f"Updated {VAL_FILE.name}: {len(old_v)} -> {len(new_v)} records")
    
if __name__ == "__main__":
    main()
