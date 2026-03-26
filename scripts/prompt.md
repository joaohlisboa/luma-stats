You are processing a Luma event registration CSV to generate a dashboard configuration for a stats webapp.

## Your Task

1. Read the CSV data below
2. Identify which columns are standard Luma fields vs custom form questions
3. Classify qualitative fields into meaningful categories
4. Compute a relevance score for each candidate
5. Generate dashboard charts and triage configuration
6. Output a single JSON object conforming to the exact schema below

## Standard Luma Columns (ignore these for charts — they are metadata)

api_id, name, first_name, last_name, email, phone_number, created_at, approval_status, checked_in_at, custom_source, qr_code_url, amount, amount_tax, amount_discount, currency, coupon_code, eth_address, solana_address, survey_response_rating, survey_response_feedback, ticket_type_id, ticket_name

Any column NOT in this list is a **custom form question** added by the event organizer.

## Classification Instructions

For each custom form question that contains qualitative/free-text data (job titles, company names, interests, motivations):

- Analyze ALL the values in that column
- Create **7-15 meaningful categories** that capture the distribution of responses
- Name categories in the **same language** as the CSV data
- Always include an "Other" / "Outros" / equivalent catch-all category
- Assign each candidate to exactly one category per field
- Store the raw value AND the classified category as separate fields

For columns with a small fixed set of values (e.g., experience level, company size, yes/no), keep the original values — do not reclassify.

## Scoring Instructions

Compute a `relevanceScore` (0-100) for each candidate. You decide the factors based on what data is available. Common factors:

- Response quality: specificity, genuine curiosity, clear intent to learn or contribute (NOT text length — a short specific answer beats a long generic one)
- Alignment with the event topic or community goals
- Whether they want to present or contribute
- Whether they provided social/professional profile links

Do NOT favor seniority or experience level. A curious student is as valuable as a CEO. Score based on genuine interest and alignment, not status.

Document what factors you used and their weights in `schema.scoreFactors`.

## Dashboard Configuration

Decide which charts to show based on the data. Use this vocabulary ONLY:

| Type | Use For |
|------|---------|
| `stat-card` | Single KPI number (total registrations, percentage, count) |
| `horizontal-bar` | Categorical breakdowns with 5+ categories (roles, industries) |
| `donut` | Small cardinality distributions, 3-6 categories (experience level, company size) |
| `area-timeline` | Registration count over time (use created_at dates) |

**Do NOT invent other chart types.** Only use the 4 types above.

Guidelines:
- Start with 2-3 stat-cards for key KPIs
- Add an area-timeline for registration over time
- Use donut for fields with 3-6 categories
- Use horizontal-bar for fields with 7+ categories
- Order charts from most interesting to least interesting

## Triage Dimensions

Choose 2-4 classified fields that are most useful for balancing event attendance (e.g., role category, industry category, experience level). These will power the balance dashboard in the triage view.

## Field Schema

For each field in the candidate data, specify how the UI should render it:

- `"filter"` — Show as a filter chip and table column (categorical fields)
- `"detail"` — Show in expanded candidate card detail view (text fields, raw values)
- `"hidden"` — Don't display (internal fields, duplicates)
- `"chart"` — Already shown in dashboard charts

## Output JSON Schema

Output EXACTLY this structure (no extra keys, no markdown, just raw JSON):

```json
{
  "meta": {
    "eventName": "string — extract from CSV context or use the event name if apparent",
    "eventDate": "string — extract from registration dates or leave empty",
    "eventLocation": "string or null",
    "processedAt": "ISO 8601 timestamp of right now",
    "candidateCount": "number — total rows in CSV",
    "lumaColumns": ["list of standard Luma column names found"],
    "customColumns": ["list of custom form question column names found"]
  },
  "schema": {
    "dashboard": [
      { "id": "unique-id", "type": "stat-card", "title": "Label", "value": "123", "subtitle": "optional" },
      { "id": "unique-id", "type": "area-timeline", "title": "Chart Title", "data": [{"name": "date label", "value": 42}], "color": "#hex optional" },
      { "id": "unique-id", "type": "donut", "title": "Chart Title", "data": [{"name": "category", "value": 42}] },
      { "id": "unique-id", "type": "horizontal-bar", "title": "Chart Title", "data": [{"name": "category", "value": 42}] }
    ],
    "triageDimensions": [
      { "key": "fieldKey", "label": "Display Name", "categories": ["Cat1", "Cat2"] }
    ],
    "fields": [
      { "key": "fieldKey", "label": "Display Label", "source": "luma|custom|classified", "render": "filter|detail|hidden|chart" }
    ],
    "scoreFactors": ["Factor 1 description (weight: X pts)", "Factor 2 description (weight: Y pts)"]
  },
  "candidates": [
    {
      "id": "the api_id value from CSV",
      "name": "full name",
      "firstName": "first_name",
      "lastName": "last_name",
      "email": "email",
      "createdAt": "created_at ISO timestamp",
      "approvalStatus": "approval_status value",
      "linkedinUrl": "LinkedIn URL if present, or omit",
      "relevanceScore": 75,
      "...any classified fields as key-value pairs..."
    }
  ]
}
```

## Critical Rules

- Use the `api_id` column as the candidate `id` field — do NOT generate new IDs
- Keep ALL PII intact (names, emails, LinkedIn URLs, phone numbers)
- Labels and category names should be in the SAME LANGUAGE as the CSV data
- Sort `data` arrays in charts by value descending (largest first)
- For the area-timeline chart, aggregate registrations by date and sort chronologically
- Do NOT include empty or mostly-empty columns as charts
- Output valid JSON only — no markdown fences, no explanation text

## CSV Data

{{CSV_DATA}}
