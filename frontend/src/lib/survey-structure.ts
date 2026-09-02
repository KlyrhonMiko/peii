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

// Config keys optionless question types may carry. `survey_phase` is written by the
// generated questionnaire and read by the backend two-phase response flow, so it must
// be preserved. The remaining keys mirror backend/services/question_validation.py.
const OPTIONLESS_CONFIG_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set(["survey_phase", "max_length"]),
  number: new Set(["survey_phase", "min", "max", "integer", "step"]),
  datetime: new Set(["survey_phase"]),
  boolean: new Set(["survey_phase"]),
  file: new Set(["survey_phase"]),
}
const EMPTY_CONFIG_KEYS = new Set<string>()

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
      config: null,
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
      config: { columns: columns.length > 0 ? columns : [...DEFAULT_MATRIX_COLUMNS] },
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
      },
    }
  }

  if (OPTIONLESS_TYPES.has(type)) {
    const allowedKeys = OPTIONLESS_CONFIG_KEYS[type] ?? EMPTY_CONFIG_KEYS
    const keptConfig: Record<string, unknown> = {}
    const source = config ?? {}
    for (const key of Object.keys(source)) {
      if (allowedKeys.has(key)) keptConfig[key] = source[key]
    }
    return {
      options: null,
      config: Object.keys(keptConfig).length > 0 ? keptConfig : null,
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

export function validateSurveyStructure(
  sections: readonly SurveyStructureSection[],
): string | null {
  for (const section of sections) {
    for (const [questionIndex, question] of section.questions.entries()) {
      const name = structureName(section, questionIndex)
      if (OPTION_TYPES.has(question.type) && !hasUniqueNonBlankStrings(question.options)) {
        return `${name} needs at least one non-blank option, with no duplicates.`
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
  }
  return null
}
