import { BadgeCheck, FileCheck2, FlaskConical, ReceiptText, Users, type LucideIcon } from 'lucide-react'
import { ConverterTile, ServicesTile, StandardTile, ThoughtTile } from './LoginTiles'
import { AirQualityWidget, AppStatusWidget, CalendarWidget, ClockWidget, WeatherWidget } from './LoginWidgets'

/*
 * Login page panels, the same as the Qirlpl login page (owner, 25 Nov 2026): company tiles on the left, live
 * widgets on the right, and the app's work steps under the sign-in box. Information only: nothing is read from the
 * database before sign-in.
 */

/** Left: what we do, standard of the day, quick unit converter and a quality thought. */
export function LoginTilesPanel() {
  return (
    <aside className="qp-auth-side widgets qp-rise" aria-label="Company Tiles">
      <div className="qp-widgets">
        <div className="span-2">
          <ServicesTile />
        </div>
        <StandardTile />
        <ConverterTile />
        <div className="span-2">
          <ThoughtTile />
        </div>
      </div>
    </aside>
  )
}

/** Right: live widgets. */
export function LoginWidgetsPanel() {
  return (
    <aside className="qp-auth-side widgets qp-rise" style={{ animationDelay: '120ms' }} aria-label="Live Information">
      <div className="qp-widgets">
        <div className="span-2">
          <ClockWidget />
        </div>
        <WeatherWidget />
        <AirQualityWidget />
        <AppStatusWidget />
        <CalendarWidget />
      </div>
    </aside>
  )
}

const STEPS: Array<{ icon: LucideIcon; tone: string; label: string }> = [
  { icon: Users, tone: 'blue', label: 'Clients' },
  { icon: FileCheck2, tone: 'indigo', label: 'Applications' },
  { icon: FlaskConical, tone: 'teal', label: 'Test Reports' },
  { icon: BadgeCheck, tone: 'green', label: 'Licences' },
  { icon: ReceiptText, tone: 'orange', label: 'Billing' },
]

/** Under the sign-in box: what the app covers. */
export function LoginStepsStrip() {
  return (
    <div className="qp-steps-strip">
      <span className="qp-steps-strip-title">From Enquiry to Licence, in One Place</span>
      <ol>
        {STEPS.map(({ icon: Icon, tone, label }) => (
          <li key={label}>
            <span className={`qp-icon sm ${tone}`} aria-hidden>
              <Icon strokeWidth={1.9} />
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
