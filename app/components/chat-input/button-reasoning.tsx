"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Sparkle } from "@phosphor-icons/react"

type ButtonReasoningProps = {
  isSelected: boolean
  onToggle: (isSelected: boolean) => void
  isAuthenticated: boolean
}

export function ButtonReasoning({
  isSelected,
  onToggle,
  isAuthenticated,
}: ButtonReasoningProps) {
  if (!isAuthenticated) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={isSelected ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onToggle(!isSelected)}
        >
          <Sparkle className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isSelected ? "Hide Reasoning" : "Show Reasoning"}
      </TooltipContent>
    </Tooltip>
  )
}
