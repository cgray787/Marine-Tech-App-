"use client";

import { Suspense } from "react";
import type { PriceLevel, JobTemplate, WOSettings } from "@/lib/work-orders/types";
import { PriceLevelsCard } from "./price-levels-card";
import { TemplatesCard } from "./templates-card";
import { DefaultsCard } from "./defaults-card";
import { QuickBooksCard } from "./quickbooks-card";

type Props = {
  priceLevels: PriceLevel[];
  jobTemplates: JobTemplate[];
  woSettings: WOSettings | null;
  orgId: string;
};

export function SettingsClient({ priceLevels, jobTemplates, woSettings, orgId }: Props) {
  const activePriceLevels = priceLevels.filter((pl) => pl.active);

  return (
    <div className="space-y-6">
      <PriceLevelsCard priceLevels={priceLevels} orgId={orgId} />
      <TemplatesCard
        jobTemplates={jobTemplates}
        activePriceLevels={activePriceLevels}
        allPriceLevels={priceLevels}
        orgId={orgId}
      />
      <DefaultsCard woSettings={woSettings} orgId={orgId} />
      <Suspense fallback={null}>
        <QuickBooksCard />
      </Suspense>
    </div>
  );
}
