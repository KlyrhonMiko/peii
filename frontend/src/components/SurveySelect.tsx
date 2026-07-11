"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDown, Check } from "lucide-react"

interface SurveySelectProps {
  id: string
  name?: string
  options: string[]
  placeholder?: string
  defaultValue?: string
  value: string | undefined
  onChange: (value: string) => void
}

export function SurveySelect({
  id,
  name,
  options,
  placeholder = "Select an option…",
  defaultValue = "",
  value: controlledValue,
  onChange,
}: SurveySelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)

  const selected = controlledValue ?? internalValue
  const setSelected = onChange ?? setInternalValue

  return (
    <div className="relative w-full">
      <input type="hidden" id={id} name={name || id} value={selected} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="w-full h-11 px-3.5 justify-between font-normal text-sm border border-slate-200 bg-white hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/10 focus-visible:border-indigo-400 select-none text-left"
            >
              <span className={selected ? "text-slate-700" : "text-slate-400 font-normal"}>
                {selected || placeholder}
              </span>
              <ChevronDown className="size-4 text-slate-400 shrink-0" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          className="w-[var(--anchor-width)] p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {placeholder && (
            <button
              type="button"
              onClick={() => {
                setSelected("")
                setOpen(false)
              }}
              className={`
                flex items-center justify-between w-full px-2.5 py-2 text-sm font-normal rounded-md text-left transition-colors cursor-pointer outline-none
                ${!selected
                  ? "bg-indigo-50/80 text-indigo-700 font-medium"
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-850"
                }
              `}
            >
              <span>{placeholder}</span>
              {!selected && <Check className="size-4 text-indigo-600" />}
            </button>
          )}
          {options.map((option) => {
            const isSelected = selected === option
            return (
              <button
                type="button"
                key={option}
                onClick={() => {
                  setSelected(option)
                  setOpen(false)
                }}
                className={`
                  flex items-center justify-between w-full px-2.5 py-2 text-sm font-normal rounded-md text-left transition-colors cursor-pointer outline-none
                  ${isSelected
                    ? "bg-indigo-50/80 text-indigo-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  }
                `}
              >
                <span>{option}</span>
                {isSelected && <Check className="size-4 text-indigo-600" />}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
