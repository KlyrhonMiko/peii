import { parseCsvRows } from "@/lib/csv"
import type { UserInput } from "@/lib/users"

export interface BulkInviteCsvResult {
  users: UserInput[]
  errors: string[]
}

export function parseBulkInviteCsv(input: string): BulkInviteCsvResult {
  const { rows, errors } = parseCsvRows(input)
  const users: UserInput[] = []

  for (const row of rows) {
    if (row.values.length < 4 || row.values.length > 6) {
      errors.push(`Line ${row.line}: expected 4 to 6 columns, found ${row.values.length}.`)
      continue
    }
    const [email, username, firstName, lastName, middleName = "", contact = ""] = row.values
    if (!email || !username || !firstName || !lastName) {
      errors.push(`Line ${row.line}: email, username, first name, and last name are required.`)
      continue
    }
    users.push({
      email,
      username,
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName || null,
      contact: contact || null,
      is_active: true,
    })
  }

  return { users, errors }
}
