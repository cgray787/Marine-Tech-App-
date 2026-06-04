/**
 * PDF HTML templates for Service Reports and PDI Reports.
 * Used with expo-print to generate professional PDF exports.
 */

type ServiceReport = {
  id: string;
  job_id: string;
  boat_name: string;
  owner_name: string;
  make_model: string;
  year: number | null;
  hin: string;
  marina: string;
  engine_make_model: string | null;
  engine_hours: number | null;
  engine_hours_port?: number | null;
  engine_hours_starboard?: number | null;
  battery_voltage: string | null;
  service_types: string[] | null;
  work_description: string | null;
  parts_used: string[] | null;
  concerns: string | null;
  general_notes: string | null;
  submitted_at: string;
};

type ChecklistItem = {
  id: string;
  category: string;
  item_name: string;
  assessment: "good" | "bad";
  notes: string | null;
  sort_order: number;
};

type ReportPhoto = {
  id: string;
  photo_url: string;
  category: string | null;
  caption: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  engine: "Engine",
  electrical: "Electrical",
  hull: "Hull",
  safety: "Safety",
  nav: "Navigation",
};

/**
 * Formats per-engine hour readings for display. Twin engines render as
 * "Port X · Stbd Y"; a single value (single-engine boats) renders bare. Falls
 * back to a legacy single reading, then to an em-dash when nothing is set.
 */
export function formatEngineHours(
  port: number | null | undefined,
  starboard: number | null | undefined,
  fallback?: number | null
): string {
  if (port != null && starboard != null) return `Port ${port} · Stbd ${starboard}`;
  if (port != null) return String(port);
  if (starboard != null) return String(starboard);
  return fallback != null ? String(fallback) : "—";
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupByCategory(
  items: ChecklistItem[]
): Record<string, ChecklistItem[]> {
  return items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
}

function getBaseStyles(): string {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #333;
        font-size: 12px;
        line-height: 1.5;
        background: #fff;
      }

      /* Header */
      .header {
        background: #0c1220;
        color: #fff;
        padding: 24px 32px;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
      .header-brand {
        display: flex;
        flex-direction: column;
      }
      .header-title {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 2px;
        color: #C9A96E;
      }
      .header-subtitle {
        font-size: 11px;
        color: #8892A5;
        margin-top: 4px;
        letter-spacing: 0.5px;
      }
      .header-date {
        font-size: 12px;
        color: #8892A5;
        text-align: right;
      }
      .header-date strong {
        color: #f1f5f9;
        display: block;
        font-size: 13px;
      }

      /* Gold accent bar */
      .accent-bar {
        height: 4px;
        background: linear-gradient(90deg, #C9A96E, #d4b87e, #C9A96E);
      }

      /* Content */
      .content {
        padding: 24px 32px;
      }

      /* Section headers */
      .section-title {
        font-size: 14px;
        font-weight: 700;
        color: #0c1220;
        margin-top: 24px;
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 2px solid #C9A96E;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .section-title:first-child {
        margin-top: 0;
      }

      /* Info table */
      .info-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }
      .info-table td {
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        vertical-align: top;
      }
      .info-table .label {
        background: #f8f9fa;
        font-weight: 600;
        color: #64748b;
        width: 140px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .info-table .value {
        color: #1e293b;
        font-weight: 500;
      }

      /* Checklist */
      .category-header {
        background: #f1f5f9;
        padding: 8px 12px;
        font-weight: 700;
        font-size: 12px;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 12px;
        border-left: 3px solid #C9A96E;
      }
      .checklist-table {
        width: 100%;
        border-collapse: collapse;
      }
      .checklist-table th {
        background: #0c1220;
        color: #f1f5f9;
        padding: 8px 12px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: left;
      }
      .checklist-table td {
        padding: 7px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 12px;
      }
      .checklist-table tr:nth-child(even) td {
        background: #f8f9fa;
      }
      .status-good {
        color: #22c55e;
        font-weight: 700;
        font-size: 11px;
      }
      .status-bad {
        color: #ef4444;
        font-weight: 700;
        font-size: 11px;
      }
      .item-note {
        padding: 6px 12px 6px 24px;
        background: #fef2f2;
        border-left: 3px solid #ef4444;
        font-size: 11px;
        color: #991b1b;
        margin-bottom: 2px;
      }
      .item-note strong {
        color: #ef4444;
      }

      /* Service types chips */
      .service-types {
        display: flex;
        flex-direction: row;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .service-chip {
        background: rgba(201, 169, 110, 0.15);
        border: 1px solid rgba(201, 169, 110, 0.4);
        color: #92722e;
        border-radius: 12px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
      }

      /* Work description & notes */
      .text-block {
        background: #f8f9fa;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 14px 16px;
        font-size: 12px;
        line-height: 1.7;
        color: #334155;
        white-space: pre-wrap;
      }

      /* Parts list */
      .parts-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .parts-list li {
        padding: 6px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 12px;
        color: #334155;
        display: flex;
        align-items: center;
      }
      .parts-list li:nth-child(even) {
        background: #f8f9fa;
      }
      .parts-list li::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #C9A96E;
        margin-right: 10px;
        flex-shrink: 0;
      }

      /* Photos */
      .photo-grid {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 8px;
      }
      .photo-item {
        width: 180px;
        text-align: center;
      }
      .photo-item img {
        width: 180px;
        height: 135px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
      }
      .photo-caption {
        font-size: 10px;
        color: #64748b;
        margin-top: 4px;
      }

      /* Footer */
      .footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: #94a3b8;
      }
      .footer-brand {
        font-weight: 600;
        color: #C9A96E;
      }

      /* Summary stats */
      .stats-row {
        display: flex;
        flex-direction: row;
        gap: 16px;
        margin-bottom: 16px;
      }
      .stat-box {
        flex: 1;
        background: #f8f9fa;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px 16px;
        text-align: center;
      }
      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #0c1220;
      }
      .stat-value.good { color: #22c55e; }
      .stat-value.bad { color: #ef4444; }
      .stat-label {
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 2px;
      }

      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .content { padding: 16px 24px; }
      }
    </style>
  `;
}

function renderChecklistSection(items: ChecklistItem[]): string {
  const grouped = groupByCategory(items);

  if (Object.keys(grouped).length === 0) {
    return "";
  }

  const goodCount = items.filter((i) => i.assessment === "good").length;
  const badCount = items.filter((i) => i.assessment === "bad").length;
  const totalCount = items.length;

  let html = `
    <div class="section-title">Inspection Results</div>
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value">${totalCount}</div>
        <div class="stat-label">Total Items</div>
      </div>
      <div class="stat-box">
        <div class="stat-value good">${goodCount}</div>
        <div class="stat-label">Good</div>
      </div>
      <div class="stat-box">
        <div class="stat-value bad">${badCount}</div>
        <div class="stat-label">Needs Attention</div>
      </div>
    </div>
  `;

  for (const [category, catItems] of Object.entries(grouped)) {
    const label = CATEGORY_LABELS[category] || category;
    html += `<div class="category-header">${escapeHtml(label)}</div>`;
    html += `<table class="checklist-table">`;

    for (const item of catItems) {
      const statusClass =
        item.assessment === "good" ? "status-good" : "status-bad";
      const statusLabel = item.assessment === "good" ? "GOOD" : "BAD";
      html += `
        <tr>
          <td>${escapeHtml(item.item_name)}</td>
          <td style="width:80px;text-align:center;">
            <span class="${statusClass}">${statusLabel}</span>
          </td>
        </tr>
      `;
    }

    html += `</table>`;

    // Show notes for bad items
    const badItems = catItems.filter(
      (it) => it.assessment === "bad" && it.notes
    );
    for (const item of badItems) {
      html += `
        <div class="item-note">
          <strong>${escapeHtml(item.item_name)}:</strong> ${escapeHtml(item.notes)}
        </div>
      `;
    }
  }

  return html;
}

function renderPhotosSection(photos: ReportPhoto[]): string {
  if (photos.length === 0) return "";

  let html = `<div class="section-title">Photos</div><div class="photo-grid">`;

  for (const photo of photos) {
    const caption = photo.caption
      ? escapeHtml(photo.caption)
      : photo.category
      ? escapeHtml(photo.category.replace(/_/g, " "))
      : "";
    html += `
      <div class="photo-item">
        <img src="${escapeHtml(photo.photo_url)}" alt="${caption}" />
        ${caption ? `<div class="photo-caption">${caption}</div>` : ""}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function parseParts(partsUsed: string[] | null): string[] {
  if (!partsUsed) return [];
  if (Array.isArray(partsUsed)) return partsUsed;
  if (typeof partsUsed === "string") {
    try {
      return JSON.parse(partsUsed as unknown as string);
    } catch {
      return [];
    }
  }
  return [];
}

export function generateServiceReportHTML(
  report: ServiceReport,
  checklistItems: ChecklistItem[],
  photos: ReportPhoto[]
): string {
  const parts = parseParts(report.parts_used);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Service Report - ${escapeHtml(report.boat_name)}</title>
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header">
        <div class="header-brand">
          <div class="header-title">MARINE TECH</div>
          <div class="header-subtitle">Service Report</div>
        </div>
        <div class="header-date">
          <strong>${formatDate(report.submitted_at)}</strong>
          Report #${escapeHtml(report.id.slice(0, 8).toUpperCase())}
        </div>
      </div>
      <div class="accent-bar"></div>

      <div class="content">

        ${
          report.service_types && report.service_types.length > 0
            ? `<div class="service-types">${report.service_types
                .map((t) => `<span class="service-chip">${escapeHtml(t)}</span>`)
                .join("")}</div>`
            : ""
        }

        <div class="section-title" style="margin-top:0;">Vessel Information</div>
        <table class="info-table">
          <tr>
            <td class="label">Boat Name</td>
            <td class="value">${escapeHtml(report.boat_name)}</td>
            <td class="label">Owner</td>
            <td class="value">${escapeHtml(report.owner_name)}</td>
          </tr>
          <tr>
            <td class="label">Make / Model</td>
            <td class="value">${escapeHtml(report.make_model)}</td>
            <td class="label">Year</td>
            <td class="value">${report.year ?? "—"}</td>
          </tr>
          <tr>
            <td class="label">HIN</td>
            <td class="value">${escapeHtml(report.hin) || "—"}</td>
            <td class="label">Marina</td>
            <td class="value">${escapeHtml(report.marina) || "—"}</td>
          </tr>
        </table>

        <div class="section-title">Systems</div>
        <table class="info-table">
          <tr>
            <td class="label">Engine</td>
            <td class="value">${escapeHtml(report.engine_make_model) || "—"}</td>
            <td class="label">Engine Hours</td>
            <td class="value">${formatEngineHours(report.engine_hours_port, report.engine_hours_starboard, report.engine_hours)}</td>
          </tr>
          <tr>
            <td class="label">Battery Voltage</td>
            <td class="value">${escapeHtml(report.battery_voltage) || "—"}</td>
            <td class="label"></td>
            <td class="value"></td>
          </tr>
        </table>

        ${renderChecklistSection(checklistItems)}

        ${
          report.work_description
            ? `
          <div class="section-title">Work Description</div>
          <div class="text-block">${escapeHtml(report.work_description)}</div>
        `
            : ""
        }

        ${
          parts.length > 0
            ? `
          <div class="section-title">Parts Used</div>
          <ul class="parts-list">
            ${parts.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
          </ul>
        `
            : ""
        }

        ${
          report.concerns
            ? `
          <div class="section-title">Concerns</div>
          <div class="text-block">${escapeHtml(report.concerns)}</div>
        `
            : ""
        }

        ${
          report.general_notes
            ? `
          <div class="section-title">General Notes</div>
          <div class="text-block">${escapeHtml(report.general_notes)}</div>
        `
            : ""
        }

        ${renderPhotosSection(photos)}

        <div class="footer">
          <div>
            <span class="footer-brand">Generated by Marine Tech App</span>
          </div>
          <div>${formatDate(report.submitted_at)}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generatePDIReportHTML(
  report: {
    id: string;
    boat_name: string;
    owner_name: string;
    make_model: string;
    year: number | null;
    hin: string;
    color: string | null;
    marina?: string;
    total_items: number;
    completed_items: number;
    flagged_items: number;
    general_notes: string | null;
    submitted_at: string;
  },
  checklistItems: ChecklistItem[],
  photos: ReportPhoto[]
): string {
  const goodCount = checklistItems.filter(
    (i) => i.assessment === "good"
  ).length;
  const badCount = checklistItems.filter(
    (i) => i.assessment === "bad"
  ).length;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>PDI Report - ${escapeHtml(report.boat_name)}</title>
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header">
        <div class="header-brand">
          <div class="header-title">MARINE TECH</div>
          <div class="header-subtitle">Pre-Delivery Inspection Report</div>
        </div>
        <div class="header-date">
          <strong>${formatDate(report.submitted_at)}</strong>
          PDI #${escapeHtml(report.id.slice(0, 8).toUpperCase())}
        </div>
      </div>
      <div class="accent-bar"></div>

      <div class="content">

        <div class="section-title" style="margin-top:0;">Vessel Information</div>
        <table class="info-table">
          <tr>
            <td class="label">Boat Name</td>
            <td class="value">${escapeHtml(report.boat_name)}</td>
            <td class="label">Owner</td>
            <td class="value">${escapeHtml(report.owner_name)}</td>
          </tr>
          <tr>
            <td class="label">Make / Model</td>
            <td class="value">${escapeHtml(report.make_model)}</td>
            <td class="label">Year</td>
            <td class="value">${report.year ?? "—"}</td>
          </tr>
          <tr>
            <td class="label">HIN</td>
            <td class="value">${escapeHtml(report.hin) || "—"}</td>
            <td class="label">Color</td>
            <td class="value">${escapeHtml(report.color) || "—"}</td>
          </tr>
          ${
            report.marina
              ? `
          <tr>
            <td class="label">Marina</td>
            <td class="value" colspan="3">${escapeHtml(report.marina)}</td>
          </tr>
          `
              : ""
          }
        </table>

        <div class="section-title">Inspection Summary</div>
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-value">${report.total_items}</div>
            <div class="stat-label">Total Items</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${report.completed_items}</div>
            <div class="stat-label">Inspected</div>
          </div>
          <div class="stat-box">
            <div class="stat-value good">${goodCount}</div>
            <div class="stat-label">Good</div>
          </div>
          <div class="stat-box">
            <div class="stat-value bad">${badCount}</div>
            <div class="stat-label">Needs Attention</div>
          </div>
        </div>

        ${renderChecklistSection(checklistItems)}

        ${
          report.general_notes
            ? `
          <div class="section-title">General Notes</div>
          <div class="text-block">${escapeHtml(report.general_notes)}</div>
        `
            : ""
        }

        ${renderPhotosSection(photos)}

        <div class="footer">
          <div>
            <span class="footer-brand">Generated by Marine Tech App</span>
          </div>
          <div>${formatDate(report.submitted_at)}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}
