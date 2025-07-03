import Gemini from "@/components/icons/gemini"

export type Provider = {
  id: string
  name: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

export const PROVIDERS: Provider[] = [
  {
    id: "gemini",
    name: "Gemini",
    icon: Gemini,
  },
] as Provider[]
