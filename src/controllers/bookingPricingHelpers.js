function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Food-only amount from snapshot plate × guests (ignores `eventTotal`). */
function deriveEventFoodSubtotal(ev) {
  const guests = Math.max(0, Number(ev?.guestCount ?? 0) || 0);
  const snap = ev?.eventSnapshot;
  const snapshotPrice =
    Number(snap?.price_per_plate ?? snap?.pricePerPlate ?? 0) || 0;
  return guests * snapshotPrice;
}

/** Stored event total when set, otherwise food-only. */
function deriveEventSubtotal(ev) {
  if (ev?.eventTotal != null) return num(ev.eventTotal);
  return deriveEventFoodSubtotal(ev);
}

/**
 * Food subtotal + service/tax/discount + all extra service lines (no double-count).
 */
function computeBookingTotalDueFromEvents(booking) {
  const events = booking.events || [];
  let foodSum = 0;
  for (const ev of events) {
    foodSum += deriveEventFoodSubtotal(ev);
  }
  const extrasSum = (booking.extraServiceLines || []).reduce(
    (s, l) => s + num(l.lineTotal),
    0,
  );
  if (foodSum <= 0 && extrasSum <= 0) return 0;

  let serviceAmt = num(booking.serviceChargeAmount);
  const servicePct = num(booking.serviceChargePct);
  if (serviceAmt <= 0 && servicePct > 0) {
    serviceAmt = foodSum * (servicePct / 100);
  }

  let taxAmt = num(booking.taxAmount);
  const taxPct = num(booking.taxPct);
  if (taxAmt <= 0 && taxPct > 0) {
    taxAmt = (foodSum + serviceAmt) * (taxPct / 100);
  }

  const disc = num(booking.discountAmount);
  return Math.max(0, foodSum + serviceAmt + taxAmt - disc + extrasSum);
}

function paymentStatusFromAmounts(amountPaid, totalDue) {
  const paid = num(amountPaid);
  const due = num(totalDue);
  if (paid <= 0) return "PENDING";
  if (paid >= due - 0.01) return "RECEIVED";
  return "PARTIAL";
}

module.exports = {
  num,
  deriveEventFoodSubtotal,
  deriveEventSubtotal,
  computeBookingTotalDueFromEvents,
  paymentStatusFromAmounts,
};
