import { useId, useState } from 'react'
import { MAGNITUDE } from './colors'
import { temperatureWord } from './labels'

// Made-up scores a model might give each next word after "The sky is".
const CANDIDATES = [
  { word: 'blue', logit: 4.0 },
  { word: 'clear', logit: 3.1 },
  { word: 'cloudy', logit: 2.6 },
  { word: 'dark', logit: 2.0 },
  { word: 'falling', logit: 0.7 },
  { word: 'purple', logit: 0.2 },
]

function probabilities(t: number): number[] {
  if (t <= 0.01) return CANDIDATES.map((_, i) => (i === 0 ? 1 : 0))
  const exps = CANDIDATES.map((c) => Math.exp(c.logit / t))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

export function TemperatureDemo({ initial = 0.7 }: { initial?: number }) {
  const [t, setT] = useState(initial)
  const sliderId = useId()
  const probs = probabilities(t)
  return (
    <figure className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={sliderId} className="text-zinc-300">
          Temperature
        </label>
        <input id={sliderId} type="range" min={0} max={2} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} className="flex-1" />
        <span className="w-32 shrink-0 text-right font-mono whitespace-nowrap text-zinc-200">
          {t.toFixed(2)} · {temperatureWord(t)}
        </span>
      </div>
      <figcaption className="text-zinc-400">
        Chance of each next word after <span className="text-zinc-200">“The sky is …”</span>
      </figcaption>
      <table className="w-full border-separate border-spacing-y-0.5">
        <tbody>
          {CANDIDATES.map((c, i) => {
            const pct = probs[i] * 100
            return (
              <tr key={c.word}>
                <th scope="row" className="w-16 pr-2 text-left font-mono font-normal text-zinc-300">
                  {c.word}
                </th>
                <td className="w-full">
                  <div className="h-3 rounded-r bg-zinc-800/60" title={`${c.word}: ${pct.toFixed(1)}%`}>
                    <div
                      className="h-3 rounded-r transition-[width] duration-150"
                      style={{ width: `${Math.max(pct, 0)}%`, backgroundColor: MAGNITUDE, borderTopRightRadius: 4, borderBottomRightRadius: 4 }}
                    />
                  </div>
                </td>
                <td className="w-12 pl-2 text-right font-mono text-zinc-300 tabular-nums">{pct < 0.1 ? '0' : pct.toFixed(pct < 10 ? 1 : 0)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </figure>
  )
}
