// React 19 renders MathML, but @types/react does not declare its elements yet.
// Only the elements the report's equations use are declared.
import type { DetailedHTMLProps, HTMLAttributes } from "react"

type MathMLProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  display?: "block" | "inline"
  mathvariant?: "normal" | "italic" | "bold"
  form?: "prefix" | "infix" | "postfix"
  lspace?: string
  rspace?: string
  movablelimits?: "true" | "false"
  width?: string
  stretchy?: "true" | "false"
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps
      mrow: MathMLProps
      mi: MathMLProps
      mn: MathMLProps
      mo: MathMLProps
      mtext: MathMLProps
      msub: MathMLProps
      mfrac: MathMLProps
      munderover: MathMLProps
      mspace: MathMLProps
    }
  }
}
