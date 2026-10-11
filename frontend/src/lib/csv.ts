/** One non-empty CSV record with its 1-based starting line number. */
export interface CsvRow {
  line: number
  values: string[]
}

export function parseCsvRows(input: string): { rows: CsvRow[]; errors: string[] } {
  const rows: CsvRow[] = []
  const errors: string[] = []
  let values: string[] = []
  let field = ""
  let line = 1
  let rowLine = 1
  let inQuotes = false
  let closedQuote = false

  const finishField = () => {
    values.push(field.trim())
    field = ""
    closedQuote = false
  }
  const finishRow = () => {
    finishField()
    if (values.some((value) => value !== "")) rows.push({ line: rowLine, values })
    values = []
    rowLine = line + 1
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          closedQuote = true
        }
      } else {
        field += character
        if (character === "\n") line += 1
      }
      continue
    }

    if (closedQuote) {
      if (character === ",") finishField()
      else if (character === "\n") {
        finishRow()
        line += 1
      } else if (character === "\r") {
        finishRow()
        if (input[index + 1] === "\n") index += 1
        line += 1
      } else if (character !== " " && character !== "\t") {
        errors.push(`Line ${line}: unexpected text after a closing quote.`)
        field += character
        closedQuote = false
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) {
        errors.push(`Line ${line}: a quoted field must start with a quote.`)
        field += character
      } else {
        inQuotes = true
      }
    } else if (character === ",") {
      finishField()
    } else if (character === "\n") {
      finishRow()
      line += 1
    } else if (character === "\r") {
      finishRow()
      if (input[index + 1] === "\n") index += 1
      line += 1
    } else {
      field += character
    }
  }

  if (inQuotes) errors.push(`Line ${rowLine}: quoted field is not closed.`)
  if (field !== "" || values.length > 0 || closedQuote) finishRow()
  return { rows, errors }
}
