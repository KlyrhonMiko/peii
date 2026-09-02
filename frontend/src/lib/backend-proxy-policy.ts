type BackendMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT"

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u
const ENCODED_BYTE = /%[0-9a-f]{2}/iu

function decodePathSegment(segment: string): string | undefined {
  let decoded = segment

  // Decode repeatedly so a value such as "%252f" cannot survive the policy as
  // the literal "%2f" and be normalized again by the upstream router.
  for (let attempt = 0; attempt <= segment.length; attempt += 1) {
    // A decoded literal percent is valid and will be encoded again below. Only
    // attempt another decode when the segment contains a complete escape.
    if (!ENCODED_BYTE.test(decoded)) return decoded

    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return undefined
    }
    if (next === decoded) return decoded
    decoded = next
  }

  return undefined
}

export function canonicalizeBackendPath(path: string[]): string[] | undefined {
  const canonicalPath: string[] = []

  for (const segment of path) {
    const decoded = decodePathSegment(segment)
    if (
      decoded === undefined ||
      decoded.length === 0 ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("?") ||
      decoded.includes("#") ||
      CONTROL_CHARACTERS.test(decoded)
    ) {
      return undefined
    }

    try {
      encodeURIComponent(decoded)
    } catch {
      return undefined
    }
    canonicalPath.push(decoded)
  }

  return canonicalPath
}

function hasValue(value: string | undefined): value is string {
  return Boolean(value)
}

function matchesSurveyResource(path: string[]): boolean {
  return path.length === 2 && path[0] === "surveys" && hasValue(path[1])
}

function matchesSurveyChild(path: string[], child: string): boolean {
  return path.length === 3 && path[0] === "surveys" && hasValue(path[1]) && path[2] === child
}

function matchesSurveyChildResource(path: string[], child: string): boolean {
  return path.length === 4 && path[0] === "surveys" && hasValue(path[1]) && path[2] === child && hasValue(path[3])
}

function matchesSurveyResponseAction(path: string[], action: string): boolean {
  return path.length === 4 && path[0] === "surveys" && hasValue(path[1]) && path[2] === "responses" && path[3] === action
}

function matchesUserResource(path: string[]): boolean {
  return path.length === 2 && path[0] === "users" && hasValue(path[1])
}

export function isAllowedBackendRequest(method: string, path: string[]): boolean {
  const canonicalPath = canonicalizeBackendPath(path)
  if (!canonicalPath) return false
  path = canonicalPath

  if (!(["DELETE", "GET", "PATCH", "POST", "PUT"] as string[]).includes(method)) return false

  const backendMethod = method as BackendMethod
  switch (backendMethod) {
    case "GET":
      return (
        (path.length === 1 && path[0] === "users") ||
        (path.length === 2 && path[0] === "rbac" && path[1] === "roles") ||
        (path.length === 2 && path[0] === "rbac" && path[1] === "permissions") ||
        (path.length === 1 && path[0] === "surveys") ||
        matchesSurveyResource(path) ||
        matchesSurveyChild(path, "distributions") ||
        matchesSurveyChild(path, "responses") ||
        matchesSurveyResponseAction(path, "aggregates") ||
        matchesSurveyResponseAction(path, "export") ||
        matchesSurveyResponseAction(path, "identity") ||
        matchesSurveyResponseAction(path, "peii")
      )
    case "POST":
      return (
        (path.length === 1 && path[0] === "users") ||
        (path.length === 2 && path[0] === "rbac" && path[1] === "roles") ||
        (path.length === 2 && path[0] === "users" && path[1] === "batch") ||
        (path.length === 3 && hasValue(path[1]) && path[0] === "users" && path[2] === "restore") ||
        (path.length === 4 && hasValue(path[1]) && path[0] === "users" && path[2] === "invitation" && path[3] === "resend") ||
        (path.length === 4 && hasValue(path[1]) && path[0] === "users" && path[2] === "sessions" && path[3] === "revoke") ||
        (path.length === 1 && path[0] === "surveys") ||
        (path.length === 2 && path[0] === "surveys" && path[1] === "with-structure") ||
        matchesSurveyChild(path, "sections") ||
        matchesSurveyChild(path, "questions") ||
        matchesSurveyChild(path, "distributions") ||
        (path.length === 3 && path[0] === "surveys" && hasValue(path[1]) && path[2] === "restore") ||
         (path.length === 5 && path[0] === "surveys" && hasValue(path[1]) &&
           path[2] === "distributions" && hasValue(path[3]) && path[4] === "rotate") ||
         matchesSurveyResponseAction(path, "erase") ||
         (path.length === 5 && path[0] === "surveys" && hasValue(path[1]) &&
           path[2] === "responses" && path[3] === "peii" && path[4] === "false-positive")
      )
    case "PATCH":
      return (
        matchesUserResource(path) ||
        (path.length === 3 && path[0] === "rbac" && path[1] === "roles" && hasValue(path[2])) ||
        matchesSurveyResource(path) ||
        matchesSurveyChildResource(path, "sections") ||
        matchesSurveyChildResource(path, "questions") ||
        (path.length === 4 && path[0] === "surveys" &&
          hasValue(path[1]) &&
          ((path[2] === "sections" && path[3] === "reorder") ||
            (path[2] === "questions" && path[3] === "reorder")))
      )
    case "PUT":
      return (
        (path.length === 3 && path[0] === "surveys" && hasValue(path[1]) && path[2] === "structure") ||
        (path.length === 4 && path[0] === "rbac" && path[1] === "users" && hasValue(path[2]) && path[3] === "roles")
      )
    case "DELETE":
      return (
        matchesUserResource(path) ||
        matchesSurveyResource(path) ||
        matchesSurveyChildResource(path, "sections") ||
        matchesSurveyChildResource(path, "questions") ||
        matchesSurveyChildResource(path, "distributions")
      )
  }
}
