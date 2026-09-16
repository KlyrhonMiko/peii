import type { PublicAnswers, PublicSurveyQuestion } from "@/lib/public-survey"

type QuestionByKey = ReadonlyMap<string, PublicSurveyQuestion>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function questionsByKey(questions: readonly PublicSurveyQuestion[]): QuestionByKey {
  const result = new Map<string, PublicSurveyQuestion>()
  for (const question of questions) {
    const key = question.config?.question_key
    if (typeof key === "string" && key) result.set(key, question)
  }
  return result
}

function sourceAnswer(
  questionKey: unknown,
  byKey: QuestionByKey,
  answers: PublicAnswers,
): string | null {
  if (typeof questionKey !== "string") return null
  const source = byKey.get(questionKey)
  if (!source) return null
  const value = answers[source.id]
  return typeof value === "string" ? value : null
}

export function availableQuestionOptions(
  question: PublicSurveyQuestion,
  byKey: QuestionByKey,
  answers: PublicAnswers,
): string[] {
  const config = question.config?.options_by_answer
  if (!isRecord(config)) return question.options ?? []
  const answer = sourceAnswer(config.question_key, byKey, answers)
  const choices = config.choices
  if (answer === null || !isRecord(choices)) return []
  const selected = choices[answer]
  if (!Array.isArray(selected)) return []
  const allowed = new Set(question.options ?? [])
  return selected.filter((option): option is string => typeof option === "string" && allowed.has(option))
}

export function isQuestionVisible(
  question: PublicSurveyQuestion,
  byKey: QuestionByKey,
  answers: PublicAnswers,
): boolean {
  const condition = question.config?.visible_when
  if (condition !== undefined) {
    if (!isRecord(condition)) return false
    const answer = sourceAnswer(condition.question_key, byKey, answers)
    if (answer === null) return false
    if (typeof condition.equals === "string") {
      if (answer !== condition.equals) return false
    } else if (Array.isArray(condition.one_of) && condition.one_of.every((value) => typeof value === "string")) {
      if (!condition.one_of.includes(answer)) return false
    } else {
      return false
    }
  }
  if (question.config?.options_by_answer !== undefined) {
    return availableQuestionOptions(question, byKey, answers).length > 0
  }
  return true
}

export function pruneConditionalAnswers(
  questions: readonly PublicSurveyQuestion[],
  byKey: QuestionByKey,
  answers: PublicAnswers,
): PublicAnswers {
  const next = { ...answers }
  for (let pass = 0; pass < questions.length; pass += 1) {
    let changed = false
    for (const question of questions) {
      if (!(question.id in next)) continue
      const selected = next[question.id]
      const invalidChoice = question.config?.options_by_answer !== undefined &&
        (typeof selected !== "string" || !availableQuestionOptions(question, byKey, next).includes(selected))
      if (!isQuestionVisible(question, byKey, next) || invalidChoice) {
        delete next[question.id]
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}
