type BackendMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT"

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

function matchesUserResource(path: string[]): boolean {
  return path.length === 2 && path[0] === "users" && hasValue(path[1])
}

export function isAllowedBackendRequest(method: string, path: string[]): boolean {
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
        matchesSurveyChild(path, "responses")
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
        matchesSurveyChild(path, "distributions")
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
