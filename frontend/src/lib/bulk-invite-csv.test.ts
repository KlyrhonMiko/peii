import { describe, expect, it } from "vitest"

import { parseBulkInviteCsv } from "./bulk-invite-csv"

describe("parseBulkInviteCsv", () => {
  it("supports quoted commas, escaped quotes, CRLF, and optional columns", () => {
    const result = parseBulkInviteCsv(
      'jane@example.com,janedoe,"Jane, Jr.",Doe\r\n' +
      'john@example.com,johndoe,John,Doe,"D""Angelo",0917',
    )

    expect(result.errors).toEqual([])
    expect(result.users).toEqual([
      {
        email: "jane@example.com",
        username: "janedoe",
        first_name: "Jane, Jr.",
        last_name: "Doe",
        middle_name: null,
        contact: null,
        is_active: true,
      },
      {
        email: "john@example.com",
        username: "johndoe",
        first_name: "John",
        last_name: "Doe",
        middle_name: 'D"Angelo',
        contact: "0917",
        is_active: true,
      },
    ])
  })

  it("rejects malformed quotes, missing fields, and extra columns", () => {
    expect(parseBulkInviteCsv('a@example.com,user,"Unclosed,Doe').errors[0]).toContain(
      "quoted field is not closed",
    )
    expect(parseBulkInviteCsv("a@example.com,user,First").errors[0]).toContain(
      "expected 4 to 6 columns",
    )
    expect(parseBulkInviteCsv("a@example.com,user,First,Last,a,b,c").errors[0]).toContain(
      "expected 4 to 6 columns",
    )
  })
})
