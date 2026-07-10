"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDown, Check } from "lucide-react"

const programs = ["All Programs", "Engineering", "Business"]

export function ProgramFilter() {
  const [selected, setSelected] = useState("All Programs")
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 px-3 flex items-center gap-1.5 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-300 select-none cursor-pointer"
          >
            <span>{selected}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-40 p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
      >
        {programs.map((program) => {
          const isSelected = selected === program
          return (
            <button
              key={program}
              onClick={() => {
                setSelected(program)
                setOpen(false)
              }}
              className={`
                flex items-center justify-between w-full px-2.5 py-1.5 text-[12px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none
                ${isSelected
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }
              `}
            >
              <span>{program}</span>
              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
