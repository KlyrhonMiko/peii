"""
Generate a curated, balanced 150-sample thesis benchmark dataset for PEII sentiment analysis.
Provides exactly:
  - 50 NEGATIVE samples (complaints, facility issues, curriculum mismatch, delays)
  - 50 NEUTRAL samples (constructive suggestions, balanced reviews, neutral observations)
  - 50 POSITIVE samples (gratitude, strong career outcomes, praise for PLP & Pasig LGU)

Languages covered: Tagalog, Taglish (colloquial Filipino college graduate code-switching), and English.
Output: backend/data/ml_thesis_benchmark.jsonl
"""

import json
import logging
from pathlib import Path
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Q1 = "What improvements should PLP implement to better support students?"
Q2 = "What message would you like to share with Pasig City leaders regarding PLP?"
Q3 = "What specific technical or soft skills do you wish were given more focus at PLP?"

DIM_EMPLOYABILITY = "Employability and Economic Mobility"
DIM_PERSONAL = "Personal Development and Life Quality"
DIM_GOV_TRUST = "Government Trust and LGU Support Valuation"
DIM_FAMILY = "Family Upliftment and Financial Stability"
DIM_CIVIC = "Civic Engagement and Community Contribution"

# ---------------------------------------------------------------------------
# 50 NEGATIVE SAMPLES (-1.0 to -0.5)
# ---------------------------------------------------------------------------
NEGATIVE_SAMPLES = [
    # Facilities & Infrastructure
    (Q1, "general", "Sobrang bagal ng internet sa campus at sirain ang mga computer sa IT laboratory. Hindi kami makapag-code nang maayos dahil kulang sa gamit.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Bulok ang mga aircon sa main building at laging sira ang elevator. Sobrang init sa rooms, hirap mag-focus sa klase.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Kulang na kulang ang reference books sa library at madalas walang internet connection. Napipilitan kaming gumastos sa labas.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Walang sapat na laboratory equipment para sa engineering and science majors. Puro drawing at lecture lang imbes na hands-on.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Napakarumi ng mga banyo at madalas walang tubig. Matagal na itong inirereklamo ng mga estudyante pero hindi inaaksyunan.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "The facilities are severely outdated. Most desktops in the computer lab cannot run modern development environments or IDEs.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Hindi gumagana ang karamihan sa mga projector sa classrooms, kaya nasasayang ang oras ng lecture kakahanap ng pamalit.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Overcrowded classrooms with broken armchairs and poor ventilation make learning very uncomfortable.", -1.0, [DIM_PERSONAL]),

    # Faculty & Instruction
    (Q1, "general", "May mga propesor na bihira pumasok pero nagbibigay ng bagsak na grade nang walang malinaw na basehan o feedback.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Some instructors only read PowerPoint slides and do not teach practical concepts required in real-world jobs.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Walang maayos na thesis mentoring. Ilang buwan kaming naghintay ng feedback sa adviser namin kaya na-delay ang graduation.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Hindi patas ang grading system ng ilang faculty members. May favoritism at walang transparency sa computation.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Puro reporting lang ang ginagawa sa klase, hindi nagtuturo ang teacher tapos ang taas pa magbigay ng exams.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Faculty turnover is high and many part-time instructors lack pedagogical training and industry experience.", -0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Bastos makipag-usap ang ibang faculty kapag nagtatanong ng grades or clearance. Walang empathy sa working students.", -1.0, [DIM_PERSONAL]),

    # Administration, Registrar, & Enrollment
    (Q1, "general", "Napakahaba ng pila sa registrar tuwing enrollment at napakabagal mag-release ng Transcript of Records at Diploma.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Nawalan ako ng job opportunity dahil inabot ng tatlong buwan bago na-release ng PLP registrar ang CAV at credentials ko.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The portal crashes constantly during enrollment, leading to missing subjects and delayed graduation schedules.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Masungit ang mga staff sa registrar and finance. Pinagpasa-pasahan kami sa iba-ibang opisina para lang sa simpleng pirma.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Lack of clear guidelines for graduation requirements caused extreme stress and unnecessary delays for our batch.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Walang malasakit ang guidance office sa mga estudyanteng nakakaranas ng burnout at mental health crises.", -1.0, [DIM_PERSONAL]),

    # OJT, Career Placement, & Job Readiness
    (Q1, "general", "Walang tulong ang PLP sa paghahanap ng OJT. Sariling kayod at walang MOA sa mga kilalang kumpanya.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The career placement office is virtually non-existent. We received zero assistance during job hunting after graduation.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Hindi kami handa sa actual corporate setup. Kulang na kulang sa industry linkages at internships ang university.", -1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Pabaya ang OJT coordinator namin. Hindi man lang nag-visit sa host company at hindi nag-monitor ng aming kalagayan.", -0.5, [DIM_EMPLOYABILITY]),

    # Skills & Curriculum Mismatch (Q3)
    (Q3, "general", "Outdated ang tinuturong programming languages. VB6 at lumang PHP pa rin ang tinuro noong college, hindi match sa industry.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Kulang sa practical application ang curriculum. Puro theory pero pagdating sa job interview, hindi namin alam ang actual tools.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "The accounting software we used was 15 years old. When I entered audit firms, I had to unlearn everything.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang training sa soft skills at professional communication, kaya hirap na hirap kami makapasa sa initial HR interviews.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Curriculum lacks cloud tools, Git version control, and modern workflows. We were left severely behind competitors.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Hindi tinuturo ang data analytics or modern tech stacks sa aming kurso kahit iyon ang hinahanap ng mga employers ngayon.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Too much focus on memorization rather than critical thinking, problem-solving, and technical fluency.", -0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang elective subjects na relevant sa emerging trends tulad ng AI, cybersecurity, o digital marketing.", -0.5, [DIM_EMPLOYABILITY]),

    # Messages to Leaders / LGU (Q2)
    (Q2, "general", "Sana naman po ayusin ninyo ang budget allocation para sa PLP. Kulang sa gamit at napag-iiwanan na ang city college natin.", -0.5, [DIM_GOV_TRUST]),
    (Q2, "general", "Laging delayed ang release ng student allowance. Umasa kami para sa pamasahe pero kung kailan patapos na ang sem tsaka lang binigay.", -1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "general", "Huwag ninyong gamitin sa pulitika ang pamantasan. Kailangan ng PLP ng tapat at competent na pamunuan.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "The scholarship stipend is appreciated but the disbursement system is disorganized and plagued by long delays.", -0.5, [DIM_GOV_TRUST]),
    (Q2, "general", "Pakinggan ninyo ang mga hinaing ng estudyante ukol sa bulok na pasilidad at hindi maayos na pamamalakad sa unibersidad.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Disappointed with the lack of accountability regarding university administrative delays and student concerns.", -1.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Bigyang pansin ang kakulangan ng regular faculty positions. Ang daming magagaling na prof ang umalis dahil mababa ang sahod.", -0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),

    # Mixed Frustrations / Struggles
    (Q1, "general", "Hirap na hirap kaming mga working students dahil inflexible ang schedules at hindi tumatanggap ng special assessments.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Unclear policies on course prerequisites caused many students in my batch to be irregular and delayed for a whole year.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "Wala man lang mental health counselor or wellness center sa school. Sobrang nakaka-drain ang academic pressure nang walang tulong.", -1.0, [DIM_PERSONAL]),
    (Q1, "general", "The student council is often restricted by admin from voicing legitimate grievances regarding tuition and facility fees.", -0.5, [DIM_CIVIC]),
    (Q1, "general", "Walang malinis na drinking fountains sa buong campus, napipilitan kaming bumili ng mineral water araw-araw.", -0.5, [DIM_PERSONAL]),
    (Q3, "general", "Lacking English proficiency and mock interview preparations. Many of my classmates struggled for over a year to get employed.", -1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Walang laboratory para sa networking and system administration subjects. Pure theoretical simulations lang.", -1.0, [DIM_EMPLOYABILITY]),
    (Q2, "general", "Sana maalis ang red tape sa City Hall at PLP administration para sa pagkuha ng student clearances at requirements.", -0.5, [DIM_GOV_TRUST]),
    (Q1, "general", "Delayed announcements ng suspensions at schedules, laging kung kailan nakabiyahe na ang mga estudyante saka magkakansela.", -0.5, [DIM_PERSONAL]),
    (Q1, "general", "Lack of financial transparency in student fees and delayed release of academic honors and latin honor credentials.", -1.0, [DIM_GOV_TRUST, DIM_PERSONAL]),
]

# ---------------------------------------------------------------------------
# 50 NEUTRAL SAMPLES (-0.0 to 0.5 mild constructive suggestions / balanced)
# ---------------------------------------------------------------------------
NEUTRAL_SAMPLES = [
    # Constructive Suggestions (Q1)
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

    # Balanced Observations (Q1)
    (Q1, "general", "The education provided was adequate for an entry-level job, though additional self-study was necessary for specialized roles.", 0.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Average ang facilities ng pamantasan. May mga maayos na silid-aralan pero may mga areas din na kailangan pang ayusin.", 0.0, [DIM_PERSONAL]),
    (Q1, "general", "Some professors are very dedicated while others simply comply with basic syllabus requirements.", 0.0, [DIM_PERSONAL]),
    (Q1, "general", "The transition from college to the workplace was manageable, although more hands-on training would have helped.", 0.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Sapat naman ang naging turo para makapasa sa board exam, subalit mas maganda kung may in-house review program.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Fair ang treatment sa mga estudyante sa pangkalahatan, pero kailangan pa rin ng continuous improvement sa administrative services.", 0.0, [DIM_PERSONAL]),
    (Q1, "general", "The tuition-free education is helpful, but students still need to cover their own project and thesis expenses.", 0.0, [DIM_FAMILY]),

    # Technical & Soft Skills Suggestions (Q3)
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

    # Constructive Messages to Leaders (Q2)
    (Q2, "suggestion", "Sana po ay patuloy na suportahan ng Pamahalaang Lungsod ng Pasig ang mga pasilidad at modernisasyon ng PLP.", 0.5, [DIM_GOV_TRUST]),
    (Q2, "suggestion", "Please consider establishing an official PLP alumni tracking and employment linkage program with Pasig business districts.", 0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "suggestion", "Maaari po sanang palawakin ang partnerships ng LGU sa mga multinational corporations sa Ortigas Center para sa OJT.", 0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "suggestion", "Keep expanding scholarship opportunities and student subsidies to cover book allowances and capstone materials.", 0.5, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "suggestion", "Sana po ay magkaroon ng research grants para sa mga magagandang undergraduate theses ng mga taga-PLP.", 0.5, [DIM_GOV_TRUST]),
    (Q2, "suggestion", "Regular monitoring of the university's academic quality and faculty welfare would help maintain competitive standards.", 0.5, [DIM_GOV_TRUST]),
    (Q2, "general", "The local government programs are appreciated, but consistent implementation across terms is important.", 0.0, [DIM_GOV_TRUST]),
    (Q2, "general", "Patuloy lang po sanang pakinggan ang boses ng mga kabataan at estudyante sa Pasig City.", 0.0, [DIM_CIVIC]),

    # More Neutral & Suggestion Statements
    (Q1, "suggestion", "Sana magkaroon ng mas maraming recreational spaces and quiet corners sa campus para makapagpahinga ang mga mag-aaral.", 0.0, [DIM_PERSONAL]),
    (Q1, "suggestion", "Ensure that Wi-Fi coverage reaches all academic floors, not just administrative offices.", 0.5, [DIM_PERSONAL]),
    (Q1, "general", "The program followed CHED standards reasonably well, but could be benchmarked against top regional universities.", 0.0, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "Maglagay ng mas transparent na job board sa loob ng campus para sa mga fresh graduates at graduating students.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "suggestion", "Improve coordination between academic departments and the registrar regarding graduation clearance schedules.", 0.0, [DIM_PERSONAL]),
    (Q3, "general", "Basic programming foundations were covered well; modern frameworks were learned mostly on the job.", 0.0, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Sana ituro ang customer service and client communication skills para sa mga call center and service industry tracks.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "suggestion", "Add certifications or prep courses for industry-recognized credentials like Cisco, AWS, or Microsoft Certified.", 0.5, [DIM_EMPLOYABILITY]),
    (Q2, "suggestion", "Sana magkaroon ng direct employment pipeline ang mga top graduates sa Pasig City Hall at LGU departments.", 0.5, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "general", "As alumni, we hope to see the university continue its transition into a center of excellence in NCR.", 0.5, [DIM_GOV_TRUST]),
    (Q1, "suggestion", "Streamline the submission of hardbound thesis copies by accepting digital institutional repository copies.", 0.0, [DIM_PERSONAL]),
    (Q3, "suggestion", "Include data privacy compliance (DPA 2012) and cyber ethics in the IT and business curriculums.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The library staff are helpful, but acquiring digital database subscriptions like IEEE or ScienceDirect would be great.", 0.5, [DIM_PERSONAL]),
    (Q2, "suggestion", "Sana maglaan ng pondo para sa faculty development and sponsored masteral degrees para sa PLP teachers.", 0.5, [DIM_GOV_TRUST]),
    (Q3, "general", "Soft skills were picked up during student org activities rather than classroom lectures.", 0.0, [DIM_PERSONAL]),
]

# ---------------------------------------------------------------------------
# 50 POSITIVE SAMPLES (0.5 to 1.0 clear satisfaction & gratitude)
# ---------------------------------------------------------------------------
POSITIVE_SAMPLES = [
    # Gratitude to Leaders & LGU (Q2)
    (Q2, "gratitude", "Maraming salamat po kay Mayor Vico Sotto at sa Pasig LGU para sa libreng edukasyon at tuloy-tuloy na allowance. Napakalaking tulong sa pamilya namin.", 1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "gratitude", "Malaki ang pasasalamat ko sa libreng tuition at scholarship ng Pasig. Kung wala ang PLP, hindi ako makakatapos ng kolehiyo.", 1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q2, "gratitude", "Thank you Pasig City leaders for investing in the youth. My PLP degree allowed me to land a stable corporate career in Ortigas.", 1.0, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
    (Q2, "gratitude", "Taos-pusong pasasalamat sa Pamahalaang Lungsod ng Pasig. Ang de-kalidad na libreng edukasyon ay nagbago sa takbo ng aming buhay.", 1.0, [DIM_GOV_TRUST, DIM_PERSONAL]),
    (Q2, "gratitude", "I am very proud to be a Pasig City scholar and PLP alumna. May God bless our city leaders for championing youth empowerment.", 1.0, [DIM_GOV_TRUST, DIM_CIVIC]),
    (Q2, "gratitude", "Napakaganda ng mga programa ng Pasig para sa mga mag-aaral. Ramdam na ramdam ang pagmamalasakit ng lokal na pamahalaan.", 1.0, [DIM_GOV_TRUST]),
    (Q2, "gratitude", "Salamat po sa modernong classroom facilities at laptop incentives na ibinigay sa aming batch. Malaking tulong sa pag-aaral.", 1.0, [DIM_GOV_TRUST, DIM_PERSONAL]),
    (Q2, "gratitude", "Proud PLPian here! Thank you to the city government for continuously improving our beloved university.", 1.0, [DIM_GOV_TRUST]),

    # Praise for Education, Professors, & Growth (Q1)
    (Q1, "general", "Napakagagaling at napakasipag ng mga propesor sa PLP. Hinubog nila kami hindi lang sa talino kundi pati sa kagandahang asal.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "The quality of instruction exceeded my expectations. Our professors were passionate mentors who truly cared about our growth.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Sobrang thankful ako sa guidance ng aking thesis adviser. Dahil sa kanya, nanalo ng award ang aming research paper.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Solid ang training sa PLP pagdating sa board exams! Proud to say na nakapasa ako in one take dahil sa galing ng review sessions.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Napakabait at accommodating ng mga teachers. Kahit mahirap ang mga lessons, laging handang mag-explain muli.", 0.5, [DIM_PERSONAL]),
    (Q1, "general", "The university fostered a supportive and collaborative student community that helped me build lifelong professional networks.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "I experienced tremendous personal development during my stay at PLP. It built my confidence and leadership skills.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "Maganda ang camaraderie at support system ng mga estudyante at organisasyon sa loob ng pamantasan.", 0.5, [DIM_PERSONAL]),

    # Career & Employment Success (Q1, Q3)
    (Q1, "general", "Dahil sa magandang pundasyon ng PLP, nakakuha agad ako ng trabaho bilang Software Engineer 2 weeks after graduation.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "My education at PLP directly contributed to my current promotion as a Team Lead. The perseverance taught to us was invaluable.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Competitive ang mga graduates ng PLP sa industry! Hindi kami nagpahuli sa mga nagtapos sa kilalang unibersidad.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Nakatulong nang husto ang aking OJT experience na inirekomenda ng PLP upang ma-hire ako agad as a regular employee.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "The hands-on accounting exercises and mock audits prepared me thoroughly for corporate finance roles.", 0.5, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Naitaguyod ko ang aking pamilya at nakapagpundar ng sariling bahay dahil sa magandang trabaho na dulot ng aking diploma sa PLP.", 1.0, [DIM_FAMILY, DIM_EMPLOYABILITY]),
    (Q1, "general", "My degree opened doors to global freelancing and high-paying remote opportunities. Very grateful to PLP!", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Magaling ang career foundation na binigay sa amin, lalo na sa analytical thinking and problem-solving under pressure.", 0.5, [DIM_EMPLOYABILITY]),

    # Skills Training Praise (Q3)
    (Q3, "general", "The communication and presentation skills developed during our defense and case presentations were very helpful in corporate meetings.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Sobrang ganda ng itinuro sa aming research methodology at quantitative analysis. Nagagamit ko ito araw-araw sa aking trabaho.", 1.0, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Practical coding exercises and project exhibits really pushed our technical limits in a very rewarding way.", 0.5, [DIM_EMPLOYABILITY]),
    (Q3, "general", "Teamwork, empathy, and ethical leadership were strongly instilled throughout all four years of my stay.", 1.0, [DIM_PERSONAL]),
    (Q3, "general", "The core competencies taught in our major subjects were very comprehensive and aligned with industry expectations.", 0.5, [DIM_EMPLOYABILITY]),

    # Civic Pride & Life Quality (Q2, Q1)
    (Q2, "gratitude", "Bilang isang Pasigueño, ipinagmamalaki kong ako'y isang PLPian! Maraming salamat sa lahat ng sumusuporta sa aming unibersidad.", 1.0, [DIM_CIVIC]),
    (Q2, "gratitude", "Thank you to Pasig City for believing in public tertiary education. You are building the future leaders of our community.", 1.0, [DIM_GOV_TRUST, DIM_CIVIC]),
    (Q2, "gratitude", "Salamat sa pamunuan ng PLP at LGU sa pagiging inspirasyon sa mga kapus-palad na mag-aaral. Padayon PLP!", 1.0, [DIM_GOV_TRUST, DIM_PERSONAL]),
    (Q1, "general", "Isang karangalan na makatapos sa Pamantasan ng Lungsod ng Pasig. Mataas ang tingin ng mga kumpanya sa ating mga graduates.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Everything I learned from my alma mater has helped me navigate life with integrity, resilience, and compassion.", 1.0, [DIM_PERSONAL]),
    (Q2, "gratitude", "Salamat po sa tuloy-tuloy na suporta at mga bagong equipment sa campus. Kitang-kita ang pagbabago at pag-unlad!", 1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "Napakagandang karanasan ang aking apat na taon sa PLP. Mababait ang kapwa estudyante at nakaka-inspire ang mga teachers.", 1.0, [DIM_PERSONAL]),
    (Q2, "gratitude", "Maraming salamat po sa LGU scholarship. Nakapagtapos ako nang walang utang ang aking mga magulang.", 1.0, [DIM_GOV_TRUST, DIM_FAMILY]),
    (Q1, "general", "The holistic education provided by PLP made me not just a better professional, but a responsible citizen of Pasig.", 1.0, [DIM_CIVIC]),
    (Q1, "general", "Super proud of our department and the faculty who went above and beyond to guide us until we passed our certifications.", 1.0, [DIM_EMPLOYABILITY]),
    (Q1, "general", "Great university environment with passionate mentors who genuinely care about student welfare.", 0.5, [DIM_PERSONAL]),
    (Q2, "gratitude", "Mabuhay ang PLP at ang Pamahalaang Lungsod ng Pasig! Tunay na may puso para sa mahihirap ngunit masisipag na estudyante.", 1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "I am forever grateful for the opportunity to study here for free and learn from some of the best educators in Pasig.", 1.0, [DIM_PERSONAL]),
    (Q1, "general", "The school spirit and alumni pride remain strong even years after graduating. Once a PLPian, always a PLPian!", 1.0, [DIM_PERSONAL]),
    (Q3, "general", "Our department gave us strong technical foundations that made learning new tools on the job very easy.", 0.5, [DIM_EMPLOYABILITY]),
    (Q2, "gratitude", "Kahanga-hanga ang suporta ng City Hall sa mga pasilidad ng PLP. Salamat sa malasakit!", 1.0, [DIM_GOV_TRUST]),
    (Q1, "general", "The scholarship helped me focus 100% on my studies without worrying about tuition deadlines.", 1.0, [DIM_FAMILY]),
    (Q1, "general", "Grateful for the guidance, kindness, and dedication of all our department staff and professors.", 1.0, [DIM_PERSONAL]),
    (Q2, "gratitude", "Thank you Pasig for the wonderful college education. I am now giving back to the community through my profession.", 1.0, [DIM_CIVIC]),
    (Q1, "general", "PLP gave me the confidence to compete with graduates from any university in the country. Truly world-class heart!", 1.0, [DIM_PERSONAL, DIM_EMPLOYABILITY]),
    (Q2, "gratitude", "Taos-pusong pasasalamat sa libreng matrikula. Isa ako ngayong lisensyadong propesyonal dahil sa PLP.", 1.0, [DIM_GOV_TRUST, DIM_EMPLOYABILITY]),
]


def generate_benchmark():
    out_file = Path(__file__).resolve().parent.parent / "data" / "ml_thesis_benchmark.jsonl"
    out_file.parent.mkdir(parents=True, exist_ok=True)

    records = []

    # Map question text to static pseudo question IDs
    q_map = {
        Q1: "01a0aa26-ccfb-7112-9b21-82ee2443d612",
        Q2: "01a0aa26-ccfc-73da-9566-57efe80360b0",
        Q3: "01a0aa26-ccfd-7512-8411-91ff8214a101",
    }

    # Helper to build record
    def add_records(samples, label_sentiment):
        for idx, (q_text, intent, ans, polarity, dims) in enumerate(samples):
            resp_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"thesis-bench-{label_sentiment}-{idx}"))
            q_id = q_map.get(q_text, str(uuid.uuid5(uuid.NAMESPACE_DNS, q_text)))
            records.append({
                "response_id": resp_id,
                "question_id": q_id,
                "question_text": q_text,
                "question_intent": intent,
                "response_text": ans,
                "label_sentiment": label_sentiment,
                "polarity": polarity,
                "dimensions": dims,
                "is_human_override": True  # Expert-curated ground truth
            })

    add_records(NEGATIVE_SAMPLES, "NEGATIVE")
    add_records(NEUTRAL_SAMPLES, "NEUTRAL")
    add_records(POSITIVE_SAMPLES, "POSITIVE")

    # Save to jsonl
    with open(out_file, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    logger.info(f"Successfully generated {len(records)} benchmark records at {out_file}")
    logger.info(f"Negative: {len(NEGATIVE_SAMPLES)}, Neutral: {len(NEUTRAL_SAMPLES)}, Positive: {len(POSITIVE_SAMPLES)}")
    return out_file


if __name__ == "__main__":
    generate_benchmark()
