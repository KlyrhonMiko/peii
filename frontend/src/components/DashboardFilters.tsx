"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDown, Check, Filter } from "lucide-react"

const departments = ["All Departments", "Engineering", "Business", "Arts", "Science"]
const batches = ["All Batches", "2024", "2023", "2022", "2021", "2020"]

export interface DashboardFiltersProps {
  onFilterChange: (filters: { department: string; batch: string }) => void
}

export function DashboardFilters({ onFilterChange }: DashboardFiltersProps) {
  const [department, setDepartment] = useState("All Departments")
  const [batch, setBatch] = useState("All Batches")
  
  const [deptOpen, setDeptOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)

  const handleDepartmentChange = (newDept: string) => {
    setDepartment(newDept)
    setDeptOpen(false)
    onFilterChange({ department: newDept, batch })
  }

  const handleBatchChange = (newBatch: string) => {
    setBatch(newBatch)
    setBatchOpen(false)
    onFilterChange({ department, batch: newBatch })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
        <Filter className="w-3.5 h-3.5" />
      </div>

      {/* Batch Filter */}
      <Popover open={batchOpen} onOpenChange={setBatchOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 px-3 flex items-center gap-1.5 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-300 select-none cursor-pointer"
            >
              <span>{batch}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-36 p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {batches.map((b) => {
            const isSelected = batch === b
            return (
              <button
                key={b}
                onClick={() => handleBatchChange(b)}
                className={`
                  flex items-center justify-between w-full px-2.5 py-1.5 text-[12px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none
                  ${isSelected
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }
                `}
              >
                <span>{b}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
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
              className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 px-3 flex items-center gap-1.5 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-300 select-none cursor-pointer"
            >
              <span>{department}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-40 p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {departments.map((dept) => {
            const isSelected = department === dept
            return (
              <button
                key={dept}
                onClick={() => handleDepartmentChange(dept)}
                className={`
                  flex items-center justify-between w-full px-2.5 py-1.5 text-[12px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none
                  ${isSelected
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }
                `}
              >
                <span>{dept}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
