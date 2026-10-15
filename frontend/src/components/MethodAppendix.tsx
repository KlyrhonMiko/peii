import { Fragment, type ReactNode } from "react"

import { BASE_COHORT, DIMENSION_WEIGHTS } from "@/lib/peii-report"

/** Subscript letters the paper uses for each dimension in Eq. 4. */
const DIMENSION_SYMBOLS: Record<string, string> = {
  "Employability and Economic Mobility": "E",
  "Family Upliftment and Financial Stability": "F",
  "Personal Development and Life Quality": "P",
  "Civic Engagement and Community Contribution": "C",
  "Governance Trust and LGU Support Valuation": "G",
}

const sub = (base: ReactNode, script: ReactNode) => (
  <msub>
    {base}
    {script}
  </msub>
)

/** A centered display equation with its "Eq(n)." label, as typeset in the paper. */
function Equation({ number, label, children }: { number: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4 py-2 text-xl text-slate-900 break-inside-avoid">
      <math display="block" aria-label={label} className="m-0">
        <mrow>
          {/* Browsers ignore mathvariant="italic" on multi-letter text, so italics come from CSS. */}
          <mtext className="italic">Eq({number}).</mtext>
          <mspace width="0.8em" />
          {children}
        </mrow>
      </math>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-pdf-block="" className="flex break-inside-avoid flex-col gap-3">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="indent-8 text-sm leading-7 text-slate-800">{children}</p>
}

/** Chapter 2's equations, worded to match how the backend computes each figure. */
export function MethodAppendix() {
  const weighted = Object.entries(DIMENSION_WEIGHTS)

  return (
    <div className="flex flex-col gap-8">
      <Block title="Measuring the Baseline and Post-Graduation Endpoints">
        <Prose>
          Every PEII item is answered on a five-point Likert scale, from 1 (Strongly Disagree) to 5 (Strongly Agree).
          For each survey wave, the score of a dimension is the mean of all ratings given to its indicator items by the
          respondents in scope:
        </Prose>
        <Equation number="1" label="D sub j equals the sum of X sub i j for i from 1 to n, divided by n">
          {sub(<mi>D</mi>, <mi>j</mi>)}
          <mo>=</mo>
          <mfrac>
            <mrow>
              <munderover>
                <mo movablelimits="false">∑</mo>
                <mrow>
                  <mi>i</mi>
                  <mo>=</mo>
                  <mn>1</mn>
                </mrow>
                <mi>n</mi>
              </munderover>
              {sub(<mi>X</mi>, <mrow><mi>i</mi><mi>j</mi></mrow>)}
            </mrow>
            <mi>n</mi>
          </mfrac>
        </Equation>
        <Prose>
          In this equation, <Inline>{sub(<mi>D</mi>, <mi>j</mi>)}</Inline> is the mean score for dimension{" "}
          <Inline><mi>j</mi></Inline>, <Inline>{sub(<mi>X</mi>, <mrow><mi>i</mi><mi>j</mi></mrow>)}</Inline> is one
          item rating in that dimension, and <Inline><mi>n</mi></Inline> is the number of ratings. The calculation runs
          separately for the pre-graduation and the post-graduation wave.
        </Prose>
      </Block>

      <Block title="Computing the Gain Score">
        <Prose>The Gain Score is the change in a dimension between the two waves:</Prose>
        <Equation number="2" label="G sub j equals D sub j After minus D sub j Before">
          {sub(<mi>G</mi>, <mi>j</mi>)}
          <mo>=</mo>
          {sub(<mi>D</mi>, <mrow><mi>j</mi><mi className="italic">After</mi></mrow>)}
          <mo>−</mo>
          {sub(<mi>D</mi>, <mrow><mi>j</mi><mi className="italic">Before</mi></mrow>)}
        </Equation>
        <Prose>
          Here, <Inline>{sub(<mi>G</mi>, <mi>j</mi>)}</Inline> is the gain for dimension <Inline><mi>j</mi></Inline>,{" "}
          <Inline>{sub(<mi>D</mi>, <mrow><mi>j</mi><mi className="italic">After</mi></mrow>)}</Inline> is the post-graduation mean, and{" "}
          <Inline>{sub(<mi>D</mi>, <mrow><mi>j</mi><mi className="italic">Before</mi></mrow>)}</Inline> is the pre-graduation baseline. A
          positive gain is an improvement.
        </Prose>
      </Block>

      <Block title="The Weighted Linear Combination (WLC) Algorithm">
        <Prose>The composite PEII score adds the five gains, each multiplied by its institutional weight:</Prose>
        <Equation number="3" label="PEII equals the sum of w sub j times G sub j for j from 1 to 5">
          <mi mathvariant="normal">PEII</mi>
          <mo>=</mo>
          <munderover>
            <mo movablelimits="false">∑</mo>
            <mrow>
              <mi>j</mi>
              <mo>=</mo>
              <mn>1</mn>
            </mrow>
            <mn>5</mn>
          </munderover>
          {sub(<mi>w</mi>, <mi>j</mi>)}
          {sub(<mi>G</mi>, <mi>j</mi>)}
        </Equation>
        <Prose>With the weights set by the PLP Research Department, the score is:</Prose>
        <Equation number="4" label="PEII as the weighted sum of the five dimension gains">
          <mi mathvariant="normal">PEII</mi>
          <mo>=</mo>
          {/* "+" sits at the top level so it keeps binary-operator spacing. */}
          {weighted.map(([dimension, weight], index) => (
            <Fragment key={dimension}>
              {index > 0 && <mo form="infix">+</mo>}
              <mrow>
                <mo form="prefix" stretchy="false">(</mo>
                <mn>{weight.toFixed(2)}</mn>
                {sub(<mi>G</mi>, <mi>{DIMENSION_SYMBOLS[dimension] ?? "?"}</mi>)}
                <mo form="postfix" stretchy="false">)</mo>
              </mrow>
            </Fragment>
          ))}
        </Equation>
        <Prose>
          The subscripts stand for Employability (E), Family (F), Personal (P), Civic (C), and Governance (G). The
          score is read against the PEII Score Interpretation Framework below.
        </Prose>
      </Block>

      <Block title="Base-100 Cohort Index for Institutional Monitoring">
        <Prose>
          To compare graduating batches, each cohort&apos;s PEII score is expressed relative to the base cohort, Batch{" "}
          {BASE_COHORT}:
        </Prose>
        <Equation number="5" label="PEII Index sub c equals PEII sub c divided by PEII sub base, times 100">
          {sub(<mi mathvariant="normal">PEII Index</mi>, <mi>c</mi>)}
          <mo>=</mo>
          <mfrac>
            {sub(<mi mathvariant="normal">PEII</mi>, <mi>c</mi>)}
            {sub(<mi mathvariant="normal">PEII</mi>, <mi className="italic">base</mi>)}
          </mfrac>
          <mo>×</mo>
          <mn>100</mn>
        </Equation>
        <Prose>
          In this formula, <Inline>{sub(<mi mathvariant="normal">PEII</mi>, <mi>c</mi>)}</Inline> is the PEII score of
          the target cohort and <Inline>{sub(<mi mathvariant="normal">PEII</mi>, <mi className="italic">base</mi>)}</Inline> is the PEII
          score of Batch {BASE_COHORT}. The index shows differences in average improvement between cohorts, not causal
          effects.
        </Prose>
      </Block>
    </div>
  )
}

function Inline({ children }: { children: ReactNode }) {
  return (
    <math display="inline" className="text-[1.05em]">
      {children}
    </math>
  )
}
