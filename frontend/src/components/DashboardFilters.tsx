"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDown, Check, Filter } from "lucide-react"

const defaultDepartments = [
  "All Departments",
  "College of Engineering",
  "College of Nursing",
  "College of Education",
  "College of Computer Studies",
  "College of Hospitality Management",
  "College of Business Administration",
  "College of Arts and Sciences",
]
export const departmentDegrees: Record<string, string[]> = {
  "College of Engineering": [
    "Bachelor of Science in Electronics Engineering"
  ],
  "College of Nursing": [
    "Bachelor of Science in Nursing"
  ],
  "College of Education": [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education",
    "Bachelor of Secondary Education - Major in English",
    "Bachelor of Secondary Education - Major in Filipino",
    "Bachelor of Secondary Education - Major in Mathematics",
    "Certificate in Teaching Program (CTP)"
  ],
  "College of Computer Studies": [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Information Technology"
  ],
  "College of Hospitality Management": [
    "Bachelor of Science in Hospitality Management"
  ],
  "College of Business Administration": [
    "Bachelor of Science in Accountancy",
    "Bachelor of Science in Business Administration - Major in Marketing Management",
    "Bachelor of Science in Entrepreneurship"
  ],
  "College of Arts and Sciences": [
    "Bachelor of Arts in Psychology"
  ]
}
const defaultBatches = ["All Batches", "2024", "2023", "2022", "2021", "2020"]

export interface DashboardFiltersProps {
  onFilterChange: (filters: { department: string; degree: string; batch: string }) => void
  availableBatches?: string[]
  availableDepartments?: string[]
}

export function DashboardFilters({ onFilterChange, availableBatches, availableDepartments }: DashboardFiltersProps) {
  const [department, setDepartment] = useState("All Departments")
  const [degree, setDegree] = useState("All Degrees")
  const [batch, setBatch] = useState("All Batches")
  
  const [deptOpen, setDeptOpen] = useState(false)
  const [degreeOpen, setDegreeOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)

  const handleDepartmentChange = (newDept: string) => {
    setDepartment(newDept)
    setDegree("All Degrees") // Reset degree when department changes
    setDeptOpen(false)
    onFilterChange({ department: newDept, degree: "All Degrees", batch })
  }

  const handleDegreeChange = (newDegree: string) => {
    setDegree(newDegree)
    setDegreeOpen(false)
    onFilterChange({ department, degree: newDegree, batch })
  }

  const handleBatchChange = (newBatch: string) => {
    setBatch(newBatch)
    setBatchOpen(false)
    onFilterChange({ department, degree, batch: newBatch })
  }

  const availableDegrees = department !== "All Departments" && departmentDegrees[department] 
    ? ["All Degrees", ...departmentDegrees[department]]
    : ["All Degrees"]

  const batches = availableBatches && availableBatches.length > 0 
    ? ["All Batches", ...availableBatches] 
    : defaultBatches

  const departments = availableDepartments && availableDepartments.length > 0
    ? ["All Departments", ...availableDepartments]
    : defaultDepartments

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-500">
        <Filter className="w-3.5 h-3.5" />
      </div>

      {/* Batch Filter */}
      <Popover open={batchOpen} onOpenChange={setBatchOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm px-3 flex items-center gap-1.5 focus-visible:ring-slate-400/20 focus-visible:border-slate-400 select-none cursor-pointer transition-all"
            >
              <span>{batch}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-36 p-1.5 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {batches.map((b) => {
            const isSelected = batch === b
            return (
              <button
                key={b}
                onClick={() => handleBatchChange(b)}
                className={`
                  flex items-center justify-between w-full px-2.5 py-2 text-[12px] rounded-lg text-left transition-colors cursor-pointer outline-none
                  ${isSelected
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                  }
                `}
              >
                <span>{b}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-slate-700" />}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>

      {/* Department Filter */}
      <Popover open={deptOpen} onOpenChange={setDeptOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm px-3 flex items-center gap-1.5 focus-visible:ring-slate-400/20 focus-visible:border-slate-400 select-none cursor-pointer transition-all"
            >
              <span className="max-w-[120px] truncate">{department}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-56 p-1.5 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {departments.map((dept) => {
            const isSelected = department === dept
            return (
              <button
                key={dept}
                onClick={() => handleDepartmentChange(dept)}
                className={`
                  flex items-center justify-between w-full px-2.5 py-2 text-[12px] rounded-lg text-left transition-colors cursor-pointer outline-none
                  ${isSelected
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                  }
                `}
              >
                <span className="truncate pr-2">{dept}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>

      {/* Degree Filter (only shown if a department is selected) */}
      {department !== "All Departments" && (
        <Popover open={degreeOpen} onOpenChange={setDegreeOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm px-3 flex items-center gap-1.5 focus-visible:ring-slate-400/20 focus-visible:border-slate-400 select-none cursor-pointer transition-all"
              >
                <span className="max-w-[150px] truncate">{degree === "All Degrees" ? "All Degrees" : degree}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
              </Button>
            }
          />
          <PopoverContent
            align="end"
            className="w-72 p-1.5 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {availableDegrees.map((deg) => {
              const isSelected = degree === deg
              return (
                <button
                  key={deg}
                  onClick={() => handleDegreeChange(deg)}
                  className={`
                    flex items-center justify-between w-full px-2.5 py-2 text-[12px] rounded-lg text-left transition-colors cursor-pointer outline-none
                    ${isSelected
                      ? "bg-slate-100 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                    }
                  `}
                >
                  <span className="truncate pr-2" title={deg}>{deg}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
