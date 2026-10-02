// Setup checklist — drives the "Setup Progress" accordion on the tournament
// Info page. Each item counts as one of the N required details; Basic Info
// and Format & Play are worth several items each so that an already-configured
// event (name/format/participant type set at creation) starts mostly done.
function basicInfoItems(t) {
  return [
    { key: "venue", section: "basic", label: "Venue", done: !!t.venue },
    { key: "city",  section: "basic", label: "City",  done: !!t.city },
  ];
}

// Single-sport / per-event workspace — Format & Play reflects this event's
// own format + participant type (already set at creation, so this section
// is typically complete immediately).
export function getEventSetupChecklist(t, event) {
  return [
    ...basicInfoItems(t),
    { key: "format",      section: "format", label: "Tournament Format", done: !!event?.format },
    { key: "participant", section: "format", label: "Participant Type",  done: !!event?.participant_type },
  ];
}

export function summarizeChecklist(items) {
  const doneCount  = items.filter(i => i.done).length;
  const totalCount = items.length;
  return {
    doneCount,
    totalCount,
    percent:  totalCount ? Math.round((doneCount / totalCount) * 100) : 100,
    complete: doneCount === totalCount,
  };
}

export function isSectionComplete(items, section) {
  const secItems = items.filter(i => i.section === section);
  return secItems.length > 0 && secItems.every(i => i.done);
}
