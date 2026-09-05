export interface DimensionColorMeta {
  hex: string
  tailwindPost: string
  tailwindPre: string
  text: string
  bgLight: string
  border: string
  shortName: string
}

export const DIMENSION_COLORS: Record<string, DimensionColorMeta> = {
  "Civic Engagement and Community Contribution": {
    hex: "#3b82f6", // blue-500
    tailwindPost: "bg-blue-500",
    tailwindPre: "bg-blue-200",
    text: "text-blue-600",
    bgLight: "bg-blue-50",
    border: "border-blue-200",
    shortName: "Civic Engagement",
  },
  "Employability and Economic Mobility": {
    hex: "#8b5cf6", // violet-500
    tailwindPost: "bg-violet-500",
    tailwindPre: "bg-violet-200",
    text: "text-violet-600",
    bgLight: "bg-violet-50",
    border: "border-violet-200",
    shortName: "Employability",
  },
  "Family Upliftment and Financial Stability": {
    hex: "#f43f5e", // rose-500
    tailwindPost: "bg-rose-500",
    tailwindPre: "bg-rose-200",
    text: "text-rose-600",
    bgLight: "bg-rose-50",
    border: "border-rose-200",
    shortName: "Family Upliftment",
  },
  "Government Trust and LGU Support Valuation": {
    hex: "#f59e0b", // amber-500
    tailwindPost: "bg-amber-500",
    tailwindPre: "bg-amber-200",
    text: "text-amber-600",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    shortName: "Govt Trust",
  },
  "Personal Development and Life Quality": {
    hex: "#10b981", // emerald-500
    tailwindPost: "bg-emerald-500",
    tailwindPre: "bg-emerald-200",
    text: "text-emerald-600",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    shortName: "Personal Development",
  },
}

const FALLBACK_COLOR: DimensionColorMeta = {
  hex: "#64748b",
  tailwindPost: "bg-slate-500",
  tailwindPre: "bg-slate-200",
  text: "text-slate-600",
  bgLight: "bg-slate-50",
  border: "border-slate-200",
  shortName: "General",
}

export function getDimensionColor(dimensionName?: string | null): DimensionColorMeta {
  if (!dimensionName) return FALLBACK_COLOR

  // Direct match
  const direct = DIMENSION_COLORS[dimensionName]
  if (direct) {
    return direct
  }

  // Partial / normalized match
  const lower = dimensionName.toLowerCase()
  if (lower.includes("civic")) {
    return DIMENSION_COLORS["Civic Engagement and Community Contribution"] ?? FALLBACK_COLOR
  }
  if (lower.includes("employab") || lower.includes("economic")) {
    return DIMENSION_COLORS["Employability and Economic Mobility"] ?? FALLBACK_COLOR
  }
  if (lower.includes("family") || lower.includes("financial")) {
    return DIMENSION_COLORS["Family Upliftment and Financial Stability"] ?? FALLBACK_COLOR
  }
  if (lower.includes("government") || lower.includes("lgu") || lower.includes("govt")) {
    return DIMENSION_COLORS["Government Trust and LGU Support Valuation"] ?? FALLBACK_COLOR
  }
  if (lower.includes("personal") || lower.includes("life quality")) {
    return DIMENSION_COLORS["Personal Development and Life Quality"] ?? FALLBACK_COLOR
  }

  return FALLBACK_COLOR
}

export const DIMENSION_HEX_COLORS = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#f43f5e", // rose-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
] as const
