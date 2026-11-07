// Object-level history: only objects changed in this client's operation are stored.
// Undo/redo does not restore an old snapshot of the entire shared canvas.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (value) => value == null ? null : structuredClone(value);

function snapshot(shapes) {
  return new Map(shapes.map((shape, index) => [shape.id, { shape: copy(shape), index }]));
}

export function createOwnStep(before, after) {
  const a = snapshot(before);
  const b = snapshot(after);
  const entries = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const prev = a.get(id) || null;
    const next = b.get(id) || null;
    if (!equal(prev, next)) {
      entries.push({ id, before: prev, after: next });
    }
  }
  return entries.length ? { entries } : null;
}

export function applyOwnStep(current, step, direction, lockedIds = new Set()) {
  const reverse = direction === 'undo';
  const changes = [];
  // Only revert an object if it still matches the state produced by our own step.
  // If another participant modified it since then, we leave it untouched.
  for (const entry of step.entries) {
    if (lockedIds.has(entry.id)) continue;
    const expected = reverse ? entry.after : entry.before;
    const desired = reverse ? entry.before : entry.after;
    const currentShape = current.find((shape) => shape.id === entry.id) || null;
    if (!equal(currentShape, expected?.shape ?? null)) continue;
    changes.push({ id: entry.id, desired });
  }
  if (!changes.length) return { shapes: current, changed: false };
  const updated = current.filter((shape) => !changes.some((change) => change.id === shape.id));
  for (const change of changes.filter((c) => c.desired)) {
    const { shape, index } = change.desired;
    updated.splice(Math.min(Math.max(index, 0), updated.length), 0, copy(shape));
  }
  return { shapes: updated, changed: !equal(current, updated) };
}

export function buildCanvasPatch(before, after) {
  const prev = new Map(before.map((shape) => [shape.id, shape]));
  const next = new Map(after.map((shape) => [shape.id, shape]));
  const upserts = after.filter((shape) => !equal(prev.get(shape.id), shape));
  const removedIds = before.filter((shape) => !next.has(shape.id)).map((shape) => shape.id);
  const beforeOrder = before.map((shape) => shape.id);
  const afterOrder = after.map((shape) => shape.id);
  // A newly inserted layer may belong in the middle, not automatically at the top.
  const expectedOrderWithoutMove = [
    ...beforeOrder.filter((id) => next.has(id)),
    ...afterOrder.filter((id) => !prev.has(id))
  ];
  const orderChanged = !equal(expectedOrderWithoutMove, afterOrder);
  if (!upserts.length && !removedIds.length && !orderChanged) return null;
  return { upserts, removedIds, order: orderChanged ? afterOrder : null };
}
