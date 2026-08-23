type BackendMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT"

function hasValue(value: string | undefined): value is string {
  return Boolean(value)
}

function matchesSurveyResource(path: string[]): boolean {
  return path.length === 2 && hasValue(path[1])
}

function matchesSurveyChild(path: string[], child: string): boolean {
  return path.length === 3 && hasValue(path[1]) && path[2] === child
}

function matchesSurveyChildResource(path: string[], child: string): boolean {
  return path.length === 4 && hasValue(path[1]) && path[2] === child && hasValue(path[3])
}

export function isAllowedBackendRequest(method: string, path: string[]): boolean {
  if (!(["DELETE", "GET", "PATCH", "POST", "PUT"] as string[]).includes(method)) return false

  const backendMethod = method as BackendMethod
  switch (backendMethod) {
    case "GET":
      return (
        (path.length === 1 && path[0] === "surveys") ||
        matchesSurveyResource(path) ||
        matchesSurveyChild(path, "distributions") ||
        matchesSurveyChild(path, "responses")
      )
    case "POST":
      return (
        (path.length === 1 && path[0] === "surveys") ||
        (path.length === 2 && path[0] === "surveys" && path[1] === "with-structure") ||
        matchesSurveyChild(path, "sections") ||
        matchesSurveyChild(path, "questions") ||
        matchesSurveyChild(path, "distributions")
      )
    case "PATCH":
      return (
        matchesSurveyResource(path) ||
        matchesSurveyChildResource(path, "sections") ||
        matchesSurveyChildResource(path, "questions") ||
        (path.length === 4 &&
          hasValue(path[1]) &&
          ((path[2] === "sections" && path[3] === "reorder") ||
            (path[2] === "questions" && path[3] === "reorder")))
      )
    case "PUT":
      return path.length === 3 && hasValue(path[1]) && path[2] === "structure"
    case "DELETE":
      return (
        matchesSurveyResource(path) ||
        matchesSurveyChildResource(path, "sections") ||
        matchesSurveyChildResource(path, "questions") ||
        matchesSurveyChildResource(path, "distributions")
      )
  }
}
