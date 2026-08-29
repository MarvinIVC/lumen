'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DataChart } from '@/lib/render/charts/data-chart';
import { cn } from '@/lib/utils/cn';

export interface CostDashboardProps {
  /** Spend so far this month and the hard ceiling, in the display currency. */
  monthToDate: number;
  monthlyCap: number;
  dailySpend: number;
  dailyCap: number;
  currency: string;
  /** Spend per day for the last week or so, oldest first. */
  recent: { label: string; value: number }[];
  killSwitchOn: boolean;
  className?: string;
}

/**
 * The admin view of the three-layer guardrail (02-ARCHITECTURE.md §7).
 *
 * The monthly cap is shown first and given the larger number, because the monthly figure is the
 * actual ceiling — the daily cap is only a burst guard, and reading it as the limit is how you
 * end up throttling students during exam week, which is exactly when they need the product.
 */
export function CostDashboard({
  monthToDate,
  monthlyCap,
  dailySpend,
  dailyCap,
  currency,
  recent,
  killSwitchOn,
  className,
}: CostDashboardProps) {
  const format = (value: number) => `${currency}${value.toFixed(2)}`;
  const monthPercent = (monthToDate / monthlyCap) * 100;
  const dayPercent = (dailySpend / dailyCap) * 100;

  return (
    <div className={cn('flex flex-col gap-4 font-sans', className)}>
      {killSwitchOn ? (
        <Card surface="sunken" className="border-danger/40">
          <p className="text-sm font-medium text-danger">Generation is paused</p>
          <p className="mt-1 text-sm text-text-muted">
            The kill switch is on. Nothing reaches a model provider until it is turned off.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-text-muted">This month</p>
            <Badge
              tone={monthPercent >= 90 ? 'danger' : monthPercent >= 70 ? 'warning' : 'neutral'}
            >
              ceiling
            </Badge>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {format(monthToDate)}
            <span className="text-base font-normal text-text-muted"> / {format(monthlyCap)}</span>
          </p>
          <Progress
            className="mt-3"
            value={monthPercent}
            tone={monthPercent >= 90 ? 'danger' : monthPercent >= 70 ? 'warning' : 'accent'}
            label={`${format(monthToDate)} of ${format(monthlyCap)} monthly cap`}
          />
        </Card>

        <Card>
          <p className="text-sm text-text-muted">Today</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">
            {format(dailySpend)}
            <span className="text-base font-normal text-text-muted"> / {format(dailyCap)}</span>
          </p>
          <Progress
            className="mt-3"
            value={dayPercent}
            tone={dayPercent >= 90 ? 'warning' : 'accent'}
            label={`${format(dailySpend)} of ${format(dailyCap)} burst guard`}
          />
          <p className="mt-2 text-xs text-text-muted">A burst guard, not the ceiling.</p>
        </Card>
      </div>

      <Card>
        <p className="mb-2 text-sm text-text-muted">Daily spend</p>
        <DataChart
          spec={{
            kind: 'bars',
            x: 'day',
            y: currency,
            series: recent,
            illustrative: false,
          }}
          alt={`Daily spend for the last ${recent.length} days, peaking at ${format(
            Math.max(...recent.map((entry) => entry.value), 0),
          )}.`}
        />
      </Card>
    </div>
  );
}
