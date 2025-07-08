"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { APP_NAME } from "@/lib/config"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { useMutation } from "@tanstack/react-query"
import Image from "next/image"

type ProModelDialogProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  currentModel: string
}

export function ProModelDialog() {
  return null
}
