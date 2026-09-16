export interface QuestionStructure {
  type: string
  options?: readonly string[] | null
  config?: Readonly<Record<string, unknown>> | null
}

export interface SurveyStructureSection {
  title?: string
  questions: readonly QuestionStructure[]
}

export interface NormalizedQuestionStructure {
  options: string[] | null
  config: Record<string, unknown> | null
}

const OPTION_TYPES = new Set(["single_choice", "multiple_choice", "ranking"])
const OPTIONLESS_TYPES = new Set(["text", "number", "datetime", "boolean", "file"])
const DEFAULT_MATRIX_COLUMNS = ["Poor", "Fair", "Good", "Excellent"]
const COMMON_CONFIG_KEYS = new Set(["survey_phase", "question_key", "visible_when"])
const CHOICE_CONFIG_KEYS = new Set([
  "survey_phase", "presentation", "question_key", "visible_when", "options_by_answer", "template_definition_version",
])

// Config keys optionless question types may carry. `survey_phase` is written by the
// generated questionnaire and read by the backend two-phase response flow, so it must
// be preserved. The remaining keys mirror backend/services/question_validation.py.
const OPTIONLESS_CONFIG_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set(["survey_phase", "max_length", "question_key", "visible_when"]),
  number: new Set(["survey_phase", "min", "max", "integer", "step", "question_key", "visible_when"]),
  datetime: COMMON_CONFIG_KEYS,
  boolean: COMMON_CONFIG_KEYS,
  file: COMMON_CONFIG_KEYS,
}
const EMPTY_CONFIG_KEYS = new Set<string>()

function keptConfig(
  config: Readonly<Record<string, unknown>> | null | undefined,
  keys: ReadonlySet<string>,
): Record<string, unknown> | null {
  const kept: Record<string, unknown> = {}
  for (const key of Object.keys(config ?? {})) {
    if (keys.has(key)) kept[key] = config?.[key]
  }
  return Object.keys(kept).length > 0 ? kept : null
}

function nonBlankStrings(values: readonly string[] | null | undefined): string[] {
  const result: string[] = []
  for (const value of values ?? []) {
    const normalized = value.trim()
    if (normalized && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

function validBounds(config: Readonly<Record<string, unknown>> | null | undefined): { min: number; max: number } {
  const min = config?.min
  const max = config?.max
  return typeof min === "number" && Number.isInteger(min) && typeof max === "number" &&
    Number.isInteger(max) && min < max
    ? { min, max }
    : { min: 1, max: 4 }
}

export function normalizeQuestionStructure(
  type: string,
  options?: readonly string[] | null,
  config?: Readonly<Record<string, unknown>> | null,
): NormalizedQuestionStructure {
  if (OPTION_TYPES.has(type)) {
    const normalizedOptions = nonBlankStrings(options)
    return {
      options: normalizedOptions.length > 0 ? normalizedOptions : ["Option 1", "Option 2"],
      config: keptConfig(config, CHOICE_CONFIG_KEYS),
    }
  }

  if (type === "matrix") {
    const rows = nonBlankStrings(options)
    const configuredColumns = config?.columns
    const columns = Array.isArray(configuredColumns)
      ? nonBlankStrings(configuredColumns.filter((column): column is string => typeof column === "string"))
      : []
    return {
      options: rows.length > 0 ? rows : ["Row 1", "Row 2"],
      config: {
        columns: columns.length > 0 ? columns : [...DEFAULT_MATRIX_COLUMNS],
        ...(keptConfig(config, COMMON_CONFIG_KEYS) ?? {}),
      },
    }
  }

  if (type === "scale") {
    const { min, max } = validBounds(config)
    return {
      options: null,
      config: {
        min,
        max,
        min_label: typeof config?.min_label === "string" ? config.min_label : "",
        max_label: typeof config?.max_label === "string" ? config.max_label : "",
        ...(keptConfig(config, COMMON_CONFIG_KEYS) ?? {}),
      },
    }
  }

  if (OPTIONLESS_TYPES.has(type)) {
    const allowedKeys = OPTIONLESS_CONFIG_KEYS[type] ?? EMPTY_CONFIG_KEYS
    return {
      options: null,
      config: keptConfig(config, allowedKeys),
    }
  }
  return { options: null, config: null }
}

function structureName(section: SurveyStructureSection, questionIndex: number): string {
  return `Question ${questionIndex + 1} in section "${section.title?.trim() || "Untitled Section"}"`
}

function hasUniqueNonBlankStrings(values: readonly string[] | null | undefined): boolean {
  const normalized = nonBlankStrings(values)
  return normalized.length > 0 && normalized.length === (values ?? []).length &&
    normalized.length === new Set(normalized).size
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface OrderedQuestion {
  question: QuestionStructure
  name: string
  index: number
}

function questionPhase(question: QuestionStructure): 1 | 2 | null {
  const phase = question.config?.survey_phase
  return phase === 1 || phase === 2 ? phase : null
}

function sourceReferenceError(
  dependent: OrderedQuestion,
  sourceKey: unknown,
  questionByKey: ReadonlyMap<string, OrderedQuestion>,
): string | null {
  if (typeof sourceKey !== "string" || !sourceKey.trim()) {
    return `${dependent.name} has an invalid conditional source question_key.`
  }

  const source = questionByKey.get(sourceKey)
  if (!source) {
    return `${dependent.name} refers to missing conditional source question_key "${sourceKey}".`
  }
  if (source.index >= dependent.index) {
    return `${dependent.name} must refer to an earlier conditional source question ("${sourceKey}").`
  }
  if (source.question.type !== "single_choice") {
    return `${dependent.name} must refer to a single-choice conditional source question ("${sourceKey}").`
  }

  const sourcePhase = questionPhase(source.question)
  const dependentPhase = questionPhase(dependent.question)
  if (sourcePhase !== null && dependentPhase !== null && sourcePhase !== dependentPhase) {
    return `${dependent.name} cannot depend on a question from survey phase ${sourcePhase}; both questions must use the same phase.`
  }
  return null
}

export function validateSurveyStructure(
  sections: readonly SurveyStructureSection[],
): string | null {
  const orderedQuestions: OrderedQuestion[] = []
  const questionByKey = new Map<string, OrderedQuestion>()

  for (const section of sections) {
    for (const [questionIndex, question] of section.questions.entries()) {
      const name = structureName(section, questionIndex)
      const orderedQuestion = { question, name, index: orderedQuestions.length }
      orderedQuestions.push(orderedQuestion)

      const questionKey = question.config?.question_key
      if (questionKey !== undefined) {
        if (typeof questionKey !== "string" || !questionKey.trim()) {
          return `${name} has an invalid question_key; it must be a non-blank string.`
        }
        if (questionByKey.has(questionKey)) {
          return `${name} has duplicate question_key "${questionKey}".`
        }
        questionByKey.set(questionKey, orderedQuestion)
      }
    }
  }

  for (const orderedQuestion of orderedQuestions) {
    const { question, name } = orderedQuestion
      if (OPTION_TYPES.has(question.type) && !hasUniqueNonBlankStrings(question.options)) {
        return `${name} needs at least one non-blank option, with no duplicates.`
      }

      const dependentOptions = question.config?.options_by_answer
      if (dependentOptions !== undefined) {
        if (
          question.type !== "single_choice" ||
          !isRecord(dependentOptions) ||
          typeof dependentOptions.question_key !== "string" ||
          !dependentOptions.question_key.trim() ||
          !isRecord(dependentOptions.choices) ||
          Object.keys(dependentOptions.choices).length === 0
        ) {
          return `${name} has invalid dependent choices.`
        }

        const sourceError = sourceReferenceError(orderedQuestion, dependentOptions.question_key, questionByKey)
        if (sourceError) return sourceError
        const source = questionByKey.get(dependentOptions.question_key)
        const sourceOptions = source?.question.options ?? []
        const sourceOptionSet = new Set(sourceOptions)
        const dependentOptionSet = new Set(question.options ?? [])
        for (const [sourceAnswer, choices] of Object.entries(dependentOptions.choices)) {
          if (!sourceAnswer.trim() || !sourceOptionSet.has(sourceAnswer)) {
            return `${name} has dependent choices for unknown source answer "${sourceAnswer}".`
          }
          if (
            !Array.isArray(choices) ||
            choices.length === 0 ||
            !choices.every((option): option is string => typeof option === "string" && Boolean(option.trim())) ||
            choices.length !== new Set(choices).size ||
            choices.some((option) => !dependentOptionSet.has(option))
          ) {
            return `${name} has invalid dependent choices.`
          }
        }
      }

      const visibleWhen = question.config?.visible_when
      if (visibleWhen !== undefined) {
        if (!isRecord(visibleWhen)) {
          return `${name} has invalid visibility conditions.`
        }
        const hasEquals = "equals" in visibleWhen
        const hasOneOf = "one_of" in visibleWhen
        if (hasEquals === hasOneOf) {
          return `${name} has invalid visibility conditions; define exactly one of equals or one_of.`
        }
        if (hasEquals) {
          if (typeof visibleWhen.equals !== "string" || !visibleWhen.equals.trim()) {
            return `${name} has an invalid visibility condition value.`
          }
        } else if (
          !Array.isArray(visibleWhen.one_of) ||
          visibleWhen.one_of.length === 0 ||
          !visibleWhen.one_of.every((option): option is string => typeof option === "string" && Boolean(option.trim())) ||
          visibleWhen.one_of.length !== new Set(visibleWhen.one_of).size
        ) {
          return `${name} has an invalid visibility condition value.`
        }
        const sourceError = sourceReferenceError(orderedQuestion, visibleWhen.question_key, questionByKey)
        if (sourceError) return sourceError
      }

      if (question.type === "matrix") {
        const columns = question.config?.columns
        const validColumns = Array.isArray(columns) && columns.every((column): column is string => typeof column === "string")
        if (!hasUniqueNonBlankStrings(question.options) || !validColumns || !hasUniqueNonBlankStrings(columns)) {
          return `${name} needs at least one non-blank row and column, with no duplicates.`
        }
      }

      if (question.type === "scale") {
        const bounds = validBounds(question.config)
        if (bounds.min === 1 && bounds.max === 4 &&
            (question.config?.min !== undefined || question.config?.max !== undefined) &&
            (question.config.min !== 1 || question.config.max !== 4)) {
          return `${name} needs integer scale bounds where minimum is less than maximum.`
        }
        if (question.options != null && !hasUniqueNonBlankStrings(question.options)) {
          return `${name} has invalid scale labels; labels must be non-blank and unique.`
        }
        if (question.options != null && question.options.length > bounds.max - bounds.min + 1) {
          return `${name} has more scale labels than its configured range allows.`
        }
      }

      if (OPTIONLESS_TYPES.has(question.type)) {
        if (question.options != null) {
          return `${name} must not define options for ${question.type} questions.`
        }
        const allowedKeys = OPTIONLESS_CONFIG_KEYS[question.type] ?? EMPTY_CONFIG_KEYS
        const invalidKey = Object.keys(question.config ?? {}).find((key) => !allowedKeys.has(key))
        if (invalidKey !== undefined) {
          return `${name} must not define unsupported configuration for ${question.type} questions ("${invalidKey}").`
        }
      }
  }
  return null
}
