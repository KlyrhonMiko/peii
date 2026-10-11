/**
 * Degree programs grouped by college, using the exact "Degree Program" answer text of the
 * tracer questionnaire. Analytics filters and alumni counts both key on these names; the
 * backend mirror is `DEPARTMENT_MAPPING` in `survey_analytics_service.py`.
 */
export const departmentDegrees: Record<string, string[]> = {
  "College of Engineering": [
    "Bachelor of Science in Electronics Engineering"
  ],
  "College of Nursing": [
    "Bachelor of Science in Nursing"
  ],
  "College of Education": [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education",
    "Bachelor of Secondary Education - Major in English",
    "Bachelor of Secondary Education - Major in Filipino",
    "Bachelor of Secondary Education - Major in Mathematics",
    "Certificate in Teaching Program (CTP)"
  ],
  "College of Computer Studies": [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Information Technology"
  ],
  "College of Hospitality Management": [
    "Bachelor of Science in Hospitality Management"
  ],
  "College of Business Administration": [
    "Bachelor of Science in Accountancy",
    "Bachelor of Science in Business Administration - Major in Marketing Management",
    "Bachelor of Science in Entrepreneurship"
  ],
  "College of Arts and Sciences": [
    "Bachelor of Arts in Psychology"
  ]
}
